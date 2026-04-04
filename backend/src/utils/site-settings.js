import { createHttpError, validateHttpOrRelativeUrl } from "./validation.js";
import {
  DEFAULT_STORAGE_QUOTA_MB,
  STORAGE_QUOTA_MAX_MB,
  STORAGE_QUOTA_MIN_MB,
  STORAGE_QUOTA_SETTING_KEY,
  normalizeStorageQuotaSettingValue,
} from "./storage-quota.js";

export const SITE_SETTING_FIELDS = [
  {
    key: "site_name",
    label: "网站名称",
    type: "text",
    maxLength: 80,
    public: true,
    defaultValue: "课程网站",
  },
  {
    key: "site_description",
    label: "网站简介",
    type: "textarea",
    maxLength: 500,
    public: true,
    defaultValue: "集中管理课程资料、作业与讨论内容。",
  },
  {
    key: "site_logo_text",
    label: "Logo 文字",
    type: "text",
    maxLength: 8,
    public: true,
    defaultValue: "课",
  },
  {
    key: "site_logo_url",
    label: "Logo 图片地址",
    type: "url",
    maxLength: 500,
    public: true,
    defaultValue: "",
  },
  {
    key: "homepage_title",
    label: "首页主标题",
    type: "text",
    maxLength: 120,
    public: true,
    defaultValue: "在线课程学习平台",
  },
  {
    key: "homepage_description",
    label: "首页说明",
    type: "textarea",
    maxLength: 800,
    public: true,
    defaultValue: "提供资料分发、作业管理与课程讨论等完整功能。",
  },
  {
    key: "homepage_primary_label",
    label: "首页主按钮文案",
    type: "text",
    maxLength: 20,
    public: true,
    defaultValue: "立即使用",
  },
  {
    key: "homepage_secondary_label",
    label: "首页次按钮文案",
    type: "text",
    maxLength: 20,
    public: true,
    defaultValue: "已有账号登录",
  },
  {
    key: "login_title",
    label: "登录页标题",
    type: "text",
    maxLength: 60,
    public: true,
    defaultValue: "登录",
  },
  {
    key: "login_description",
    label: "登录页说明",
    type: "text",
    maxLength: 160,
    public: true,
    defaultValue: "使用账号或学号进入课程后台",
  },
  {
    key: "register_title",
    label: "注册页标题",
    type: "text",
    maxLength: 60,
    public: true,
    defaultValue: "注册",
  },
  {
    key: "register_description",
    label: "注册页说明",
    type: "text",
    maxLength: 160,
    public: true,
    defaultValue: "创建属于你的课程账号",
  },
  {
    key: "registration_enabled",
    label: "开放用户注册",
    type: "boolean",
    public: true,
    defaultValue: "1",
  },
  {
    key: "allowed_origins",
    label: "允许跨域来源",
    type: "textarea",
    maxLength: 2000,
    public: false,
    defaultValue: "",
  },
  {
    key: STORAGE_QUOTA_SETTING_KEY,
    label: "资源容量上限(MB)",
    type: "number",
    public: false,
    defaultValue: `${DEFAULT_STORAGE_QUOTA_MB}`,
  },
];

const SITE_SETTING_FIELD_MAP = new Map(
  SITE_SETTING_FIELDS.map((field) => [field.key, field]),
);

const ALLOWED_ORIGIN_WILDCARD_PATTERN = /^https?:\/\/\*\.[^/\s]+$/i;

function splitAllowedOriginsInput(value) {
  return `${value ?? ""}`
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeAllowedOriginsValue(value, maxLength = 2000) {
  const values = splitAllowedOriginsInput(value);

  if (!values.length) {
    return "";
  }

  const normalizedValues = [];

  for (const item of values) {
    const normalizedItem = item.toLowerCase();

    if (ALLOWED_ORIGIN_WILDCARD_PATTERN.test(normalizedItem)) {
      normalizedValues.push(normalizedItem);
      continue;
    }

    let parsed;
    try {
      parsed = new URL(normalizedItem);
    } catch (error) {
      throw createHttpError(
        400,
        "允许跨域来源格式无效，请使用 https://example.com 并用逗号或换行分隔",
      );
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw createHttpError(400, "允许跨域来源仅支持 http 或 https 协议");
    }

    if (parsed.username || parsed.password) {
      throw createHttpError(400, "允许跨域来源不能包含账号信息");
    }

    if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
      throw createHttpError(
        400,
        "允许跨域来源仅支持域名级地址，请勿包含路径、参数或锚点",
      );
    }

    normalizedValues.push(parsed.origin.toLowerCase());
  }

  const serialized = Array.from(new Set(normalizedValues)).join(",");

  if (serialized.length > maxLength) {
    throw createHttpError(400, `允许跨域来源不能超过 ${maxLength} 个字符`);
  }

  return serialized;
}

export const PUBLIC_SITE_SETTING_KEYS = SITE_SETTING_FIELDS.filter(
  (field) => field.public,
).map((field) => field.key);

export const DEFAULT_SITE_SETTINGS = Object.fromEntries(
  SITE_SETTING_FIELDS.map((field) => [field.key, field.defaultValue]),
);

export function getSiteSettingDefinitions() {
  return SITE_SETTING_FIELDS.map((field) => ({ ...field }));
}

export function mergeSiteSettings(rows = []) {
  const settings = { ...DEFAULT_SITE_SETTINGS };

  for (const row of rows) {
    const key = row.setting_key;
    if (key in settings) {
      settings[key] = row.setting_value ?? DEFAULT_SITE_SETTINGS[key];
    }
  }

  return settings;
}

export function normalizeSiteSettingValue(key, value) {
  const field = SITE_SETTING_FIELD_MAP.get(key);

  if (!field) {
    throw createHttpError(400, `不支持的站点设置项：${key}`);
  }

  if (field.type === "boolean") {
    if (typeof value === "boolean") {
      return value ? "1" : "0";
    }

    const normalizedValue = `${value ?? ""}`.trim().toLowerCase();
    return ["1", "true", "yes", "on"].includes(normalizedValue) ? "1" : "0";
  }

  if (key === "allowed_origins") {
    return normalizeAllowedOriginsValue(value, field.maxLength);
  }

  if (key === STORAGE_QUOTA_SETTING_KEY) {
    const normalizedValue = `${value ?? ""}`.trim();

    if (!normalizedValue) {
      return `${DEFAULT_STORAGE_QUOTA_MB}`;
    }

    const parsed = Number.parseInt(normalizedValue, 10);
    if (!Number.isFinite(parsed)) {
      throw createHttpError(400, "资源容量上限必须是整数(MB)");
    }

    if (parsed < STORAGE_QUOTA_MIN_MB || parsed > STORAGE_QUOTA_MAX_MB) {
      throw createHttpError(
        400,
        `资源容量上限需在 ${STORAGE_QUOTA_MIN_MB} 到 ${STORAGE_QUOTA_MAX_MB} MB 之间`,
      );
    }

    return `${normalizeStorageQuotaSettingValue(parsed)}`;
  }

  const normalized = typeof value === "string" ? value.trim() : "";
  const truncated = normalized.slice(0, field.maxLength);

  if (field.type === "url" && truncated) {
    const validationError = validateHttpOrRelativeUrl(truncated, field.label);
    if (validationError) {
      throw createHttpError(400, validationError);
    }
  }

  return truncated;
}

export function sanitizeSiteSettings(input = {}) {
  const output = {};

  for (const field of SITE_SETTING_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(input, field.key)) {
      continue;
    }

    output[field.key] = normalizeSiteSettingValue(field.key, input[field.key]);
  }

  return output;
}
