import { parseIntegerEnv } from "./env.js";
import { createHttpError } from "./validation.js";

export const STORAGE_QUOTA_SETTING_KEY = "storage_quota_mb";
export const FREE_TIER_STORAGE_QUOTA_MB = 10240;
export const DEFAULT_STORAGE_QUOTA_MB = FREE_TIER_STORAGE_QUOTA_MB;
export const STORAGE_QUOTA_MIN_MB = 100;
export const STORAGE_QUOTA_MAX_MB = 1024 * 1024;

const STORAGE_USAGE_CACHE_TTL_MS = 2 * 60 * 1000;
const STORAGE_QUOTA_CACHE_TTL_MS = 30 * 1000;
const STORAGE_METRICS_REQUEST_TIMEOUT_MS = 2500;

let cachedStorageUsage = {
  usedBytes: 0,
  source: "database-estimate",
  expiresAt: 0,
};
let storageUsagePromise = null;

let cachedStorageQuota = {
  quotaBytes: DEFAULT_STORAGE_QUOTA_MB * 1024 * 1024,
  source: "default",
  expiresAt: 0,
};
let storageQuotaPromise = null;

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatStorageBytes(bytes) {
  const normalizedBytes = Math.max(0, toNumber(bytes, 0));
  if (!normalizedBytes) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    Math.floor(Math.log(normalizedBytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = normalizedBytes / 1024 ** exponent;

  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function parseStorageQuotaMbStrict(value) {
  const parsed = parseIntegerEnv(value, null);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  if (parsed < STORAGE_QUOTA_MIN_MB || parsed > STORAGE_QUOTA_MAX_MB) {
    return null;
  }

  return parsed;
}

function parseStorageQuotaMbLoose(value, fallback = DEFAULT_STORAGE_QUOTA_MB) {
  const parsed = parseIntegerEnv(value, null);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(STORAGE_QUOTA_MIN_MB, Math.min(STORAGE_QUOTA_MAX_MB, parsed));
}

async function loadConfiguredStorageQuotaMb(db, env = {}) {
  if (db && typeof db.prepare === "function") {
    try {
      const row = await db
        .prepare(
          `
        SELECT setting_value
        FROM site_settings
        WHERE setting_key = ?
        LIMIT 1
      `,
        )
        .bind(STORAGE_QUOTA_SETTING_KEY)
        .first();

      const quotaMb = parseStorageQuotaMbStrict(row?.setting_value);
      if (quotaMb) {
        return {
          quotaMb,
          source: "site-settings",
        };
      }
    } catch (error) {
      console.warn(
        `Load storage quota from site settings error: ${error?.message || error}`,
      );
    }
  }

  const envQuotaMb = parseStorageQuotaMbStrict(env.STORAGE_QUOTA_MB);
  if (envQuotaMb) {
    return {
      quotaMb: envQuotaMb,
      source: "env",
    };
  }

  return {
    quotaMb: DEFAULT_STORAGE_QUOTA_MB,
    source: "default",
  };
}

function parseMetricClassBytes(metricClass) {
  if (!metricClass || typeof metricClass !== "object") {
    return 0;
  }

  const publishedBytes =
    toNumber(metricClass?.published?.payloadSize) +
    toNumber(metricClass?.published?.metadataSize);
  const uploadedBytes =
    toNumber(metricClass?.uploaded?.payloadSize) +
    toNumber(metricClass?.uploaded?.metadataSize);

  return Math.max(publishedBytes, uploadedBytes);
}

function parseR2MetricsUsedBytes(result) {
  const normalizedResult = result && typeof result === "object" ? result : {};

  const standardBytes = parseMetricClassBytes(normalizedResult.standard);
  const infrequentAccessBytes = parseMetricClassBytes(
    normalizedResult.infrequentAccess,
  );
  const directPayloadBytes = toNumber(normalizedResult.payloadSize);
  const directMetadataBytes = toNumber(normalizedResult.metadataSize);
  const directBytes = directPayloadBytes + directMetadataBytes;

  return Math.max(standardBytes + infrequentAccessBytes, directBytes, 0);
}

async function fetchR2MetricsUsedBytes(env = {}) {
  const accountId =
    `${env.CF_ACCOUNT_ID || env.CLOUDFLARE_ACCOUNT_ID || ""}`.trim();
  const apiToken =
    `${env.CF_API_TOKEN || env.CLOUDFLARE_API_TOKEN || ""}`.trim();

  if (!accountId || !apiToken) {
    return null;
  }

  let timeoutId = null;

  try {
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error("R2 metrics API request timeout"));
      }, STORAGE_METRICS_REQUEST_TIMEOUT_MS);
    });

    const response = await Promise.race([
      fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/metrics`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json",
          },
        },
      ),
      timeoutPromise,
    ]);

    if (!response.ok) {
      return null;
    }

    const data = await response.json().catch(() => null);
    if (!data || (typeof data.success === "boolean" && !data.success)) {
      return null;
    }

    const parsedUsedBytes = parseR2MetricsUsedBytes(data.result || data);
    if (!Number.isFinite(parsedUsedBytes) || parsedUsedBytes < 0) {
      return null;
    }

    return parsedUsedBytes;
  } catch (error) {
    console.warn(`Fetch R2 metrics error: ${error?.message || error}`);
    return null;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function sumStoredFileSizes(rawValue) {
  if (!rawValue) {
    return 0;
  }

  try {
    const parsed = JSON.parse(rawValue);
    const items = Array.isArray(parsed) ? parsed : [parsed];

    return items.reduce((sum, item) => {
      if (!item || typeof item !== "object") {
        return sum;
      }

      return sum + toNumber(item.size ?? item.file_size);
    }, 0);
  } catch (error) {
    return 0;
  }
}

async function sumBySql(db, sql, ...bindings) {
  const result = await db
    .prepare(sql)
    .bind(...bindings)
    .first();
  return toNumber(result?.total);
}

async function sumJsonAttachmentColumn(db, tableName, columnName) {
  const { results } = await db
    .prepare(
      `
    SELECT ${columnName} AS raw_value
    FROM ${tableName}
    WHERE ${columnName} IS NOT NULL AND TRIM(${columnName}) != ''
  `,
    )
    .all();

  return (results || []).reduce(
    (sum, row) => sum + sumStoredFileSizes(row.raw_value),
    0,
  );
}

async function sumBucketPrefixSize(bucket, prefix) {
  if (!bucket || typeof bucket.list !== "function") {
    return 0;
  }

  let totalBytes = 0;
  let cursor = undefined;
  let hasMore = true;

  while (hasMore) {
    const response = await bucket.list({
      prefix,
      cursor,
      limit: 1000,
    });

    for (const object of response?.objects || []) {
      totalBytes += toNumber(object?.size);
    }

    hasMore = Boolean(response?.truncated);
    cursor = response?.cursor;
  }

  return totalBytes;
}

async function estimateStorageUsedBytesFromDatabase(db, bucket = null) {
  if (!db || typeof db.prepare !== "function") {
    return 0;
  }

  const [
    materialsBytes,
    postMediaBytes,
    assignmentAttachmentBytes,
    submissionAttachmentBytes,
    avatarBytes,
    brandingBytes,
  ] = await Promise.all([
    sumBySql(db, "SELECT COALESCE(SUM(file_size), 0) AS total FROM materials"),
    sumBySql(db, "SELECT COALESCE(SUM(file_size), 0) AS total FROM post_media"),
    sumJsonAttachmentColumn(db, "assignments", "attachment_key"),
    sumJsonAttachmentColumn(db, "submissions", "file_keys"),
    sumBucketPrefixSize(bucket, "avatars/"),
    sumBucketPrefixSize(bucket, "branding/"),
  ]);

  return (
    materialsBytes +
    postMediaBytes +
    assignmentAttachmentBytes +
    submissionAttachmentBytes +
    avatarBytes +
    brandingBytes
  );
}

export async function getStorageQuotaInfo(
  env = {},
  db = env?.DB,
  options = {},
) {
  const now = Date.now();
  const forceRefresh = Boolean(options.forceRefresh);

  if (!forceRefresh && cachedStorageQuota.expiresAt > now) {
    return { ...cachedStorageQuota };
  }

  if (!forceRefresh && storageQuotaPromise) {
    return storageQuotaPromise;
  }

  storageQuotaPromise = (async () => {
    const quotaConfig = await loadConfiguredStorageQuotaMb(db, env);
    cachedStorageQuota = {
      quotaBytes: quotaConfig.quotaMb * 1024 * 1024,
      source: quotaConfig.source,
      expiresAt: Date.now() + STORAGE_QUOTA_CACHE_TTL_MS,
    };

    return { ...cachedStorageQuota };
  })().finally(() => {
    storageQuotaPromise = null;
  });

  return storageQuotaPromise;
}

export async function getEstimatedStorageUsageInfo(
  env = {},
  db = env?.DB,
  options = {},
) {
  const now = Date.now();
  const forceRefresh = Boolean(options.forceRefresh);

  if (!forceRefresh && cachedStorageUsage.expiresAt > now) {
    return { ...cachedStorageUsage };
  }

  if (!forceRefresh && storageUsagePromise) {
    return storageUsagePromise;
  }

  storageUsagePromise = (async () => {
    const metricsUsedBytes = await fetchR2MetricsUsedBytes(env);

    if (Number.isFinite(metricsUsedBytes) && metricsUsedBytes >= 0) {
      cachedStorageUsage = {
        usedBytes: metricsUsedBytes,
        source: "r2-metrics-api",
        expiresAt: Date.now() + STORAGE_USAGE_CACHE_TTL_MS,
      };

      return { ...cachedStorageUsage };
    }

    const estimatedBytes = await estimateStorageUsedBytesFromDatabase(
      db,
      env?.BUCKET,
    );
    cachedStorageUsage = {
      usedBytes: estimatedBytes,
      source: "database-estimate",
      expiresAt: Date.now() + STORAGE_USAGE_CACHE_TTL_MS,
    };

    return { ...cachedStorageUsage };
  })().finally(() => {
    storageUsagePromise = null;
  });

  return storageUsagePromise;
}

export async function getStorageOverview(env = {}, db = env?.DB, options = {}) {
  const [quotaInfo, usageInfo] = await Promise.all([
    getStorageQuotaInfo(env, db, options),
    getEstimatedStorageUsageInfo(env, db, options),
  ]);

  return {
    quotaBytes: quotaInfo.quotaBytes,
    quotaSource: quotaInfo.source,
    usedBytes: usageInfo.usedBytes,
    usageSource: usageInfo.source,
  };
}

export async function ensureStorageQuotaForIncomingBytes(
  env = {},
  db = env?.DB,
  incomingBytes = 0,
  options = {},
) {
  const incoming = Math.max(0, toNumber(incomingBytes));
  const bytesToFree = Math.max(0, toNumber(options?.bytesToFree));
  const overview = await getStorageOverview(env, db, {
    forceRefresh: Boolean(options?.forceRefresh),
  });
  const effectiveUsedBytes = Math.max(overview.usedBytes - bytesToFree, 0);
  const projectedUsedBytes = effectiveUsedBytes + incoming;

  if (projectedUsedBytes <= overview.quotaBytes) {
    return {
      ...overview,
      incomingBytes: incoming,
      bytesToFree,
      effectiveUsedBytes,
      projectedUsedBytes,
      remainingBytes: Math.max(overview.quotaBytes - projectedUsedBytes, 0),
    };
  }

  const remainingBytes = Math.max(overview.quotaBytes - effectiveUsedBytes, 0);
  throw createHttpError(
    413,
    `存储空间不足：已用 ${formatStorageBytes(effectiveUsedBytes)} / ${formatStorageBytes(overview.quotaBytes)}，剩余 ${formatStorageBytes(remainingBytes)}。免费容量建议上限约为 ${FREE_TIER_STORAGE_QUOTA_MB} MB（10 GB），请先清理文件，或在“站点设置”中调整资源容量上限。`,
  );
}

export function normalizeStorageQuotaSettingValue(
  value,
  fallback = DEFAULT_STORAGE_QUOTA_MB,
) {
  return parseStorageQuotaMbLoose(value, fallback);
}
