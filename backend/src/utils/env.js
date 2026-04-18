const DEFAULT_DEVELOPMENT_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

const DEFAULT_JWT_ISSUER = "course-hub";
const DEFAULT_JWT_AUDIENCE = "course-hub-users";
const DEFAULT_DEVELOPMENT_JWT_SECRET = "course-hub-local-dev-secret";
const AUTO_JWT_SECRET_KV_KEY = "course-hub:auto-jwt-secret";
const AUTO_JWT_SECRET_DB_KEY = "runtime_jwt_secret";
const KV_OPERATION_TIMEOUT_MS = 1500;
const DEFAULT_PRODUCTION_ALLOWED_ORIGINS = ["https://*.pages.dev"];
const DYNAMIC_ALLOWED_ORIGINS_SETTING_KEY = "allowed_origins";
const ALLOWED_ORIGINS_CACHE_TTL_MS = 30 * 1000;
const SQL_NOW_UTC8 = "datetime('now', '+8 hours')";

let cachedRuntimeJwtSecret = "";
let ensureJwtSecretPromise = null;
let cachedDynamicAllowedOrigins = [];
let cachedDynamicAllowedOriginsExpiresAt = 0;
let dynamicAllowedOriginsPromise = null;

function cacheRuntimeJwtSecret(secret = "") {
  const normalized = `${secret || ""}`.trim();
  if (normalized) {
    cachedRuntimeJwtSecret = normalized;
  }

  return cachedRuntimeJwtSecret;
}

function isPlaceholderSecret(secret = "") {
  return (
    secret.includes("change-this") ||
    secret === "your-jwt-secret-change-this-in-production"
  );
}

function hasKvReadWriteBinding(env = {}) {
  return (
    Boolean(env?.KV) &&
    typeof env.KV.get === "function" &&
    typeof env.KV.put === "function"
  );
}

function hasD1Binding(db) {
  return Boolean(db) && typeof db.prepare === "function";
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

function generateRandomSecret(byteLength = 48) {
  const randomBytes = new Uint8Array(byteLength);
  crypto.getRandomValues(randomBytes);
  return Array.from(randomBytes, (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

async function readOrCreateAutoJwtSecret(env = {}) {
  if (!hasKvReadWriteBinding(env)) {
    return "";
  }

  const existingSecret = `${
    (await withTimeout(
      env.KV.get(AUTO_JWT_SECRET_KV_KEY),
      KV_OPERATION_TIMEOUT_MS,
      "KV 读取 JWT_SECRET",
    )) || ""
  }`.trim();
  if (existingSecret) {
    return existingSecret;
  }

  const generatedSecret = generateRandomSecret();
  await withTimeout(
    env.KV.put(AUTO_JWT_SECRET_KV_KEY, generatedSecret),
    KV_OPERATION_TIMEOUT_MS,
    "KV 写入 JWT_SECRET",
  );

  console.warn(
    "JWT_SECRET 未配置，已自动生成并写入 KV。建议在 Cloudflare Secrets 中显式配置 JWT_SECRET 以便集中管理。",
  );

  return generatedSecret;
}

async function readOrCreateAutoJwtSecretFromDb(db) {
  if (!hasD1Binding(db)) {
    return "";
  }

  const existingResult = await db
    .prepare(
      `
      SELECT setting_value
      FROM site_settings
      WHERE setting_key = ?
      LIMIT 1
    `,
    )
    .bind(AUTO_JWT_SECRET_DB_KEY)
    .first();

  const existingSecret = `${existingResult?.setting_value || ""}`.trim();
  if (existingSecret) {
    return existingSecret;
  }

  const generatedSecret = generateRandomSecret();
  await db
    .prepare(
      `
      INSERT INTO site_settings (setting_key, setting_value, updated_by, updated_at)
      VALUES (?, ?, NULL, ${SQL_NOW_UTC8})
      ON CONFLICT(setting_key) DO UPDATE SET
        setting_value = excluded.setting_value,
        updated_by = excluded.updated_by,
        updated_at = ${SQL_NOW_UTC8}
    `,
    )
    .bind(AUTO_JWT_SECRET_DB_KEY, generatedSecret)
    .run();

  console.warn(
    "JWT_SECRET 未配置，已自动生成并写入 D1。建议在 Cloudflare Secrets 中显式配置 JWT_SECRET。",
  );

  return generatedSecret;
}

export function getAppEnv(env = {}) {
  return `${env.APP_ENV || env.NODE_ENV || "development"}`.trim().toLowerCase();
}

export function isProductionEnv(env = {}) {
  return getAppEnv(env) === "production";
}

export function parseIntegerEnv(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseCommaSeparatedValues(value) {
  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isWildcardOriginPattern(value = "") {
  return /^https?:\/\/\*\.[^/\s]+$/i.test(`${value || ""}`.trim());
}

function normalizeOrigin(value = "") {
  const normalized = `${value || ""}`.trim().toLowerCase();
  if (!normalized) {
    return "";
  }

  if (isWildcardOriginPattern(normalized)) {
    return normalized;
  }

  try {
    const parsed = new URL(normalized);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "";
    }

    if (parsed.username || parsed.password) {
      return "";
    }

    if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
      return "";
    }

    return parsed.origin.toLowerCase();
  } catch (error) {
    return "";
  }
}

function normalizeOrigins(values = []) {
  return Array.from(
    new Set(values.map((item) => normalizeOrigin(item)).filter(Boolean)),
  );
}

function resolvePagesOriginFromRequest(requestUrl = "") {
  if (!requestUrl) {
    return "";
  }

  try {
    const parsed = new URL(requestUrl);
    const hostname = `${parsed.hostname || ""}`.toLowerCase();

    if (!hostname.endsWith(".pages.dev")) {
      return "";
    }

    return `${parsed.protocol}//${parsed.host}`.toLowerCase();
  } catch (error) {
    return "";
  }
}

function isOriginMatchedByPattern(origin = "", pattern = "") {
  if (!origin || !pattern) {
    return false;
  }

  if (!isWildcardOriginPattern(pattern)) {
    return origin === pattern;
  }

  const wildcardMatch = pattern.match(/^(https?):\/\/\*\.([^/\s]+)$/i);
  if (!wildcardMatch) {
    return false;
  }

  try {
    const parsedOrigin = new URL(origin);
    const protocol = `${wildcardMatch[1].toLowerCase()}:`;
    const suffix = `${wildcardMatch[2] || ""}`.toLowerCase();
    const hostname = `${parsedOrigin.hostname || ""}`.toLowerCase();

    if (parsedOrigin.protocol !== protocol) {
      return false;
    }

    return hostname.endsWith(`.${suffix}`);
  } catch (error) {
    return false;
  }
}

export function clearAllowedOriginsCache() {
  cachedDynamicAllowedOrigins = [];
  cachedDynamicAllowedOriginsExpiresAt = 0;
  dynamicAllowedOriginsPromise = null;
}

async function loadDynamicAllowedOrigins(env = {}, db = env?.DB) {
  const now = Date.now();

  if (cachedDynamicAllowedOriginsExpiresAt > now) {
    return cachedDynamicAllowedOrigins;
  }

  if (dynamicAllowedOriginsPromise) {
    return dynamicAllowedOriginsPromise;
  }

  dynamicAllowedOriginsPromise = (async () => {
    if (!hasD1Binding(db)) {
      cachedDynamicAllowedOrigins = [];
      cachedDynamicAllowedOriginsExpiresAt =
        Date.now() + ALLOWED_ORIGINS_CACHE_TTL_MS;
      return cachedDynamicAllowedOrigins;
    }

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
        .bind(DYNAMIC_ALLOWED_ORIGINS_SETTING_KEY)
        .first();

      cachedDynamicAllowedOrigins = normalizeOrigins(
        parseCommaSeparatedValues(row?.setting_value),
      );
    } catch (error) {
      console.warn(
        `读取动态跨域来源失败，将回退到默认配置：${error?.message || error}`,
      );
      cachedDynamicAllowedOrigins = [];
    }

    cachedDynamicAllowedOriginsExpiresAt =
      Date.now() + ALLOWED_ORIGINS_CACHE_TTL_MS;
    return cachedDynamicAllowedOrigins;
  })().finally(() => {
    dynamicAllowedOriginsPromise = null;
  });

  return dynamicAllowedOriginsPromise;
}

export async function getAllowedOrigins(
  env = {},
  requestUrl = "",
  db = env?.DB,
) {
  const configuredOrigins = normalizeOrigins(
    parseCommaSeparatedValues(env.ALLOWED_ORIGINS),
  );

  if (!isProductionEnv(env)) {
    return configuredOrigins.length
      ? configuredOrigins
      : DEFAULT_DEVELOPMENT_ORIGINS;
  }

  const runtimeDefaults = [...DEFAULT_PRODUCTION_ALLOWED_ORIGINS];
  const pagesOrigin = resolvePagesOriginFromRequest(requestUrl);

  if (pagesOrigin) {
    runtimeDefaults.unshift(pagesOrigin);
  }

  const dynamicOrigins = await loadDynamicAllowedOrigins(env, db);

  return normalizeOrigins([
    ...runtimeDefaults,
    ...configuredOrigins,
    ...dynamicOrigins,
  ]);
}

export async function isOriginAllowed(
  origin,
  env = {},
  requestUrl = "",
  db = env?.DB,
) {
  if (!origin) {
    return true;
  }

  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) {
    return false;
  }

  const allowedOrigins = await getAllowedOrigins(env, requestUrl, db);

  return allowedOrigins.some((allowedOrigin) =>
    isOriginMatchedByPattern(normalizedOrigin, allowedOrigin),
  );
}

export async function resolveCorsOrigin(
  origin,
  env = {},
  requestUrl = "",
  db = env?.DB,
) {
  if (!origin) {
    return undefined;
  }

  return (await isOriginAllowed(origin, env, requestUrl, db)) ? origin : "";
}

export function getJwtConfig(env = {}) {
  return {
    issuer: env.JWT_ISSUER || DEFAULT_JWT_ISSUER,
    audience: env.JWT_AUDIENCE || DEFAULT_JWT_AUDIENCE,
    expiresIn: env.JWT_EXPIRES_IN || "7d",
    algorithm: "HS256",
  };
}

export function getJwtSecret(env = {}) {
  const configuredSecret = `${env.JWT_SECRET || ""}`.trim();
  if (configuredSecret) {
    cacheRuntimeJwtSecret(configuredSecret);
    return configuredSecret;
  }

  if (cachedRuntimeJwtSecret) {
    return cachedRuntimeJwtSecret;
  }

  if (isProductionEnv(env)) {
    return "";
  }

  return cacheRuntimeJwtSecret(
    `${env.DEV_JWT_SECRET || DEFAULT_DEVELOPMENT_JWT_SECRET}`.trim(),
  );
}

export async function ensureJwtSecret(env = {}, db = env?.DB) {
  const configuredSecret = `${env.JWT_SECRET || ""}`.trim();
  if (configuredSecret) {
    return cacheRuntimeJwtSecret(configuredSecret);
  }

  if (!isProductionEnv(env)) {
    return cacheRuntimeJwtSecret(
      `${env.DEV_JWT_SECRET || DEFAULT_DEVELOPMENT_JWT_SECRET}`.trim(),
    );
  }

  if (cachedRuntimeJwtSecret) {
    return cachedRuntimeJwtSecret;
  }

  if (!ensureJwtSecretPromise) {
    ensureJwtSecretPromise = (async () => {
      try {
        const kvSecret = await readOrCreateAutoJwtSecret(env);
        if (kvSecret) {
          return cacheRuntimeJwtSecret(kvSecret);
        }
      } catch (error) {
        console.warn(
          `KV 自动密钥不可用，将尝试 D1 回退：${error?.message || error}`,
        );
      }

      const d1Secret = await readOrCreateAutoJwtSecretFromDb(db);
      if (d1Secret) {
        return cacheRuntimeJwtSecret(d1Secret);
      }

      throw new Error(
        "生产环境未配置 JWT_SECRET，且无法通过 KV 或 D1 自动生成安全密钥",
      );
    })().catch((error) => {
      ensureJwtSecretPromise = null;
      throw error;
    });
  }

  return ensureJwtSecretPromise;
}

export function getMaterialMaxSizeBytes(env = {}) {
  const explicitBytes = parseIntegerEnv(env.MATERIAL_MAX_SIZE_BYTES, null);
  if (explicitBytes && explicitBytes > 0) {
    return explicitBytes;
  }

  const maxSizeMb = parseIntegerEnv(env.MATERIAL_MAX_SIZE_MB, 100);
  return Math.max(maxSizeMb, 1) * 1024 * 1024;
}

export function assertRuntimeConfig(env = {}) {
  const issues = [];
  const configuredJwtSecret = getJwtSecret(env);

  if (!configuredJwtSecret) {
    if (isProductionEnv(env)) {
      issues.push("JWT_SECRET 未配置且自动生成失败");
    } else {
      issues.push("JWT_SECRET 未配置，当前使用开发环境兜底密钥");
    }
  } else if (isPlaceholderSecret(configuredJwtSecret)) {
    issues.push("JWT_SECRET 仍为默认占位值");
  }

  if (issues.length && isProductionEnv(env)) {
    throw new Error(issues.join("；"));
  }

  if (issues.length) {
    console.warn(`Runtime configuration warning: ${issues.join("；")}`);
  }
}

export async function ensureRuntimeConfig(env = {}, db = env?.DB) {
  await ensureJwtSecret(env, db);
  assertRuntimeConfig(env);
}
