const KV_RATE_LIMIT_TIMEOUT_MS = 1500;
const MEMORY_RATE_LIMIT_MAX_BUCKETS = 2000;
const memoryRateLimitBuckets = new Map();

function cleanupMemoryRateLimitBuckets(nowMs = Date.now()) {
  for (const [bucketKey, bucketState] of memoryRateLimitBuckets.entries()) {
    if (!bucketState || bucketState.expiresAt <= nowMs) {
      memoryRateLimitBuckets.delete(bucketKey);
    }
  }

  if (memoryRateLimitBuckets.size <= MEMORY_RATE_LIMIT_MAX_BUCKETS) {
    return;
  }

  const overflowCount =
    memoryRateLimitBuckets.size - MEMORY_RATE_LIMIT_MAX_BUCKETS;
  const staleKeys = [];

  for (const [bucketKey] of memoryRateLimitBuckets.entries()) {
    staleKeys.push(bucketKey);
    if (staleKeys.length >= overflowCount) {
      break;
    }
  }

  for (const bucketKey of staleKeys) {
    memoryRateLimitBuckets.delete(bucketKey);
  }
}

function getMemoryRateLimitCount(bucketKey, nowMs = Date.now()) {
  const bucketState = memoryRateLimitBuckets.get(bucketKey);
  if (!bucketState || bucketState.expiresAt <= nowMs) {
    memoryRateLimitBuckets.delete(bucketKey);
    return 0;
  }

  return Number.parseInt(bucketState.count, 10) || 0;
}

function setMemoryRateLimitCount(
  bucketKey,
  count,
  windowSeconds,
  nowMs = Date.now(),
) {
  memoryRateLimitBuckets.set(bucketKey, {
    count,
    expiresAt: nowMs + (windowSeconds + 60) * 1000,
  });
  cleanupMemoryRateLimitBuckets(nowMs);
}

async function withTimeout(promise, timeoutMs, operationName) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${operationName} 超时`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function enforceRateLimit(c, options = {}) {
  const namespace = c.env.KV;
  if (!namespace) {
    return null;
  }

  const limit = Math.max(Number.parseInt(options.limit, 10) || 10, 1);
  const windowSeconds = Math.max(
    Number.parseInt(options.windowSeconds, 10) || 60,
    1,
  );
  const scope = `${options.scope || "global"}`;
  const key = `${options.key || "anonymous"}`;
  const windowId = Math.floor(Date.now() / (windowSeconds * 1000));
  const bucketKey = `rate:${scope}:${key}:${windowId}`;

  try {
    const currentCount =
      Number.parseInt(
        await withTimeout(
          namespace.get(bucketKey),
          KV_RATE_LIMIT_TIMEOUT_MS,
          "KV 限流读取",
        ),
        10,
      ) || 0;

    c.header("X-RateLimit-Limit", String(limit));
    c.header(
      "X-RateLimit-Remaining",
      String(Math.max(limit - currentCount - 1, 0)),
    );

    if (currentCount >= limit) {
      c.header("Retry-After", String(windowSeconds));
      return c.json(
        { error: options.message || "请求过于频繁，请稍后再试" },
        429,
      );
    }

    await withTimeout(
      namespace.put(bucketKey, String(currentCount + 1), {
        expirationTtl: windowSeconds + 60,
      }),
      KV_RATE_LIMIT_TIMEOUT_MS,
      "KV 限流写入",
    );
  } catch (error) {
    const nowMs = Date.now();
    const currentCount = getMemoryRateLimitCount(bucketKey, nowMs);

    c.header("X-RateLimit-Limit", String(limit));
    c.header(
      "X-RateLimit-Remaining",
      String(Math.max(limit - currentCount - 1, 0)),
    );

    if (currentCount >= limit) {
      c.header("Retry-After", String(windowSeconds));
      return c.json(
        { error: options.message || "请求过于频繁，请稍后再试" },
        429,
      );
    }

    setMemoryRateLimitCount(bucketKey, currentCount + 1, windowSeconds, nowMs);

    console.warn(
      `Rate limit degraded, fallback to in-memory bucket: ${error?.message || error}`,
    );
  }

  return null;
}
