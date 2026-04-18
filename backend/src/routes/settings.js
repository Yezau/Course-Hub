import { Hono } from "hono";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import { clearAllowedOriginsCache } from "../utils/env.js";
import {
  getAuditContext,
  listAuditLogs,
  recordAuditLog,
} from "../utils/audit.js";
import {
  createPublicFileResponse,
  normalizeUploadedFileName,
  validateImageFile,
} from "../utils/uploads.js";
import {
  DEFAULT_SITE_SETTINGS,
  PUBLIC_SITE_SETTING_KEYS,
  getSiteSettingDefinitions,
  mergeSiteSettings,
  sanitizeSiteSettings,
} from "../utils/site-settings.js";
import { ensureStorageQuotaForIncomingBytes } from "../utils/storage-quota.js";

const app = new Hono();
const SITE_LOGO_OBJECT_KEY = "branding/site-logo";
const SQL_NOW_UTC8 = "datetime('now', '+8 hours')";

async function loadSiteSettings(db, keys = null) {
  let result;

  if (Array.isArray(keys) && keys.length) {
    const placeholders = keys.map(() => "?").join(", ");
    result = await db
      .prepare(
        `
      SELECT setting_key, setting_value
      FROM site_settings
      WHERE setting_key IN (${placeholders})
    `,
      )
      .bind(...keys)
      .all();
  } else {
    result = await db
      .prepare(
        `
      SELECT setting_key, setting_value
      FROM site_settings
    `,
      )
      .all();
  }

  return mergeSiteSettings(result.results || []);
}

async function saveSiteSetting(db, key, value, actorId = null) {
  await db
    .prepare(
      `
    INSERT INTO site_settings (setting_key, setting_value, updated_by, updated_at)
    VALUES (?, ?, ?, ${SQL_NOW_UTC8})
    ON CONFLICT(setting_key) DO UPDATE SET
      setting_value = excluded.setting_value,
      updated_by = excluded.updated_by,
      updated_at = ${SQL_NOW_UTC8}
  `,
    )
    .bind(key, value, actorId)
    .run();
}

app.get("/public", async (c) => {
  try {
    const settings = await loadSiteSettings(c.env.DB, PUBLIC_SITE_SETTING_KEYS);
    c.header("Cache-Control", "no-store");
    return c.json({ settings });
  } catch (error) {
    console.error("Load public settings error:", error);
    c.header("Cache-Control", "no-store");
    return c.json({
      settings: { ...DEFAULT_SITE_SETTINGS },
      degraded: true,
    });
  }
});

app.get("/assets/site-logo/file", async (c) => {
  const object = await c.env.BUCKET.get(SITE_LOGO_OBJECT_KEY);

  if (!object?.body) {
    return c.json({ error: "站点 Logo 不存在" }, 404);
  }

  return createPublicFileResponse(object, {
    fileName: "site-logo",
    contentType: "image/png",
  });
});

app.use("/*", authMiddleware);

app.get("/", requireRole("admin"), async (c) => {
  const settings = await loadSiteSettings(c.env.DB);
  c.header("Cache-Control", "no-store");

  return c.json({
    settings,
    defaults: DEFAULT_SITE_SETTINGS,
    definitions: getSiteSettingDefinitions(),
  });
});

app.put("/", requireRole("admin"), async (c) => {
  const body = await c.req.json();
  const nextSettings = sanitizeSiteSettings(body?.settings || body);

  if (!Object.keys(nextSettings).length) {
    return c.json({ error: "没有可保存的站点设置" }, 400);
  }

  const auditContext = getAuditContext(c);

  for (const [key, value] of Object.entries(nextSettings)) {
    await c.env.DB.prepare(
      `
      INSERT INTO site_settings (setting_key, setting_value, updated_by, updated_at)
      VALUES (?, ?, ?, ${SQL_NOW_UTC8})
      ON CONFLICT(setting_key) DO UPDATE SET
        setting_value = excluded.setting_value,
        updated_by = excluded.updated_by,
        updated_at = ${SQL_NOW_UTC8}
    `,
    )
      .bind(key, value, auditContext.actorId)
      .run();
  }

  clearAllowedOriginsCache();

  await recordAuditLog(c.env.DB, {
    ...auditContext,
    action: "site_settings.update",
    targetType: "site_settings",
    summary: `更新了 ${Object.keys(nextSettings).length} 项站点设置`,
    details: {
      updated_keys: Object.keys(nextSettings),
    },
  });

  c.header("Cache-Control", "no-store");

  return c.json({
    message: "站点设置已更新",
    settings: await loadSiteSettings(c.env.DB),
  });
});

app.post("/assets/site-logo", requireRole("admin"), async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get("file");
    const fileError = validateImageFile(file, { label: "Logo 图片" });

    if (fileError) {
      return c.json({ error: fileError }, 400);
    }

    const incomingBytes = Number(file?.size || 0);
    if (incomingBytes > 0) {
      await ensureStorageQuotaForIncomingBytes(c.env, c.env.DB, incomingBytes);
    }

    await c.env.BUCKET.put(SITE_LOGO_OBJECT_KEY, file.stream(), {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
    });

    const auditContext = getAuditContext(c);
    const logoUrl = `/settings/assets/site-logo/file?v=${Date.now()}`;

    await saveSiteSetting(
      c.env.DB,
      "site_logo_url",
      logoUrl,
      auditContext.actorId,
    );

    await recordAuditLog(c.env.DB, {
      ...auditContext,
      action: "site_settings.logo_upload",
      targetType: "site_settings",
      summary: `更新了站点 Logo：${normalizeUploadedFileName(file.name)}`,
      details: {
        setting_key: "site_logo_url",
        file_name: normalizeUploadedFileName(file.name),
        file_size: file.size || 0,
      },
    });

    c.header("Cache-Control", "no-store");

    return c.json({
      message: "站点 Logo 已上传",
      logo_url: logoUrl,
      settings: await loadSiteSettings(c.env.DB),
    });
  } catch (error) {
    console.error("Upload site logo error:", error);
    const status = Number.isInteger(error?.status) ? error.status : 500;
    return c.json({ error: error?.message || "上传站点 Logo 失败" }, status);
  }
});

app.get("/audit-logs", requireRole("admin"), async (c) => {
  const logs = await listAuditLogs(c.env.DB, {
    targetType: "site_settings",
    limit: c.req.query("limit") || 20,
  });

  c.header("Cache-Control", "no-store");

  return c.json({ logs });
});

export default app;
