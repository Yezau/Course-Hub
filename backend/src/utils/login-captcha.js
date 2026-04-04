const CAPTCHA_LENGTH = 4;
const CAPTCHA_TTL_MS = 5 * 60 * 1000;

function randomDigit() {
  return Math.floor(Math.random() * 10);
}

function escapeSvg(value) {
  return `${value || ""}`
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTimestamp(value) {
  return new Date(value).toISOString();
}

export function buildLoginAttemptKey(ipAddress, account) {
  return `${`${ipAddress || "unknown"}`.trim()}::${`${account || "anonymous"}`.trim().toLowerCase()}`;
}

export function normalizeCaptchaInput(value) {
  return `${value || ""}`.replace(/\D/g, "").slice(0, CAPTCHA_LENGTH);
}

export function generateCaptchaCode() {
  return Array.from({ length: CAPTCHA_LENGTH }, () => randomDigit()).join("");
}

export function createCaptchaImageDataUrl(code) {
  const safeCode = escapeSvg(code);
  const offsets = Array.from({ length: 3 }, (_, index) => {
    const startY = 18 + index * 16;
    const endY = 40 + index * 12;
    const color = ["#cbd5e1", "#bfdbfe", "#ddd6fe"][index];
    return `<path d="M10 ${startY} C 55 ${startY - 14}, 120 ${endY + 8}, 170 ${endY}" stroke="${color}" stroke-width="2" fill="none" opacity="0.9" />`;
  }).join("");

  const dots = Array.from({ length: 18 }, (_, index) => {
    const x = 12 + ((index * 9) % 165);
    const y = 12 + ((index * 17) % 42);
    return `<circle cx="${x}" cy="${y}" r="1.4" fill="#94a3b8" opacity="0.65" />`;
  }).join("");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="180" height="64" viewBox="0 0 180 64">
      <rect width="180" height="64" rx="14" fill="#f8fafc" />
      <rect x="1" y="1" width="178" height="62" rx="13" fill="none" stroke="#cbd5e1" />
      ${offsets}
      ${dots}
      <text x="90" y="42" text-anchor="middle" font-family="monospace" font-size="28" font-weight="700" letter-spacing="8" fill="#0f172a">${safeCode}</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function isCaptchaExpired(captchaExpiresAt) {
  if (!captchaExpiresAt) {
    return true;
  }

  const expiresAt = new Date(captchaExpiresAt).getTime();
  return !Number.isFinite(expiresAt) || expiresAt <= Date.now();
}

export async function ensureLoginAttemptRecord(
  db,
  scopeKey,
  failedAttempts,
  captchaCode,
  captchaExpiresAt,
) {
  return null;
}

export async function getLoginAttemptRecord(db, scopeKey) {
  return null;
}

export async function clearLoginAttemptRecord(db, scopeKey) {
  return null;
}

export async function cleanupExpiredLoginAttempts(db) {
  return null;
}

export async function issueLoginCaptcha(db, scopeKey, failedAttempts = 1) {
  return {
    require_captcha: false,
    captcha_image: "",
    captcha_expires_at: null,
  };
}
