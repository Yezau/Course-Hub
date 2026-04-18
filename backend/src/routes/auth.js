import { Hono } from "hono";
import bcrypt from "bcryptjs";
import { sign } from "hono/jwt";
import { authMiddleware } from "../middleware/auth.js";
import { getInstallationStatus } from "../db/init.js";
import {
  buildLoginAttemptKey,
  cleanupExpiredLoginAttempts,
  clearLoginAttemptRecord,
  createCaptchaImageDataUrl,
  getLoginAttemptRecord,
  isCaptchaExpired,
  issueLoginCaptcha,
  normalizeCaptchaInput,
} from "../utils/login-captcha.js";
import { getAuditContext, recordAuditLog } from "../utils/audit.js";
import { getJwtConfig, getJwtSecret } from "../utils/env.js";
import { enforceRateLimit } from "../utils/rate-limit.js";
import { getClientIp } from "../utils/security.js";
import { toPublicEmail, toStoredEmail } from "../utils/user-email.js";
import {
  normalizeEmail,
  normalizeOptionalString,
  normalizeRequiredString,
  validateEmail,
  validatePassword,
  validateRealName,
  validateStudentId,
  validateUsername,
} from "../utils/validation.js";

const app = new Hono();
const ENABLED_SETTING_VALUES = new Set(["1", "true", "yes", "on"]);
const DEFAULT_JWT_EXPIRES_IN_SECONDS = 7 * 24 * 60 * 60;
const SQL_NOW_UTC8 = "datetime('now', '+8 hours')";
const JWT_DURATION_UNIT_IN_SECONDS = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 24 * 60 * 60,
  w: 7 * 24 * 60 * 60,
};

function createSetupRequiredResponse(c) {
  return c.json(
    {
      error: "系统尚未完成初始化，请先完成安装向导",
      code: "SETUP_REQUIRED",
      setup_required: true,
    },
    503,
  );
}

function sanitizeUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    email: toPublicEmail(user.email),
    role: user.role,
    real_name: user.real_name,
    student_id: user.student_id,
    avatar_url: user.avatar_url,
  };
}

async function findConflictingUser(
  db,
  { username, email, studentId, excludeUserId = null },
) {
  const conditions = [];
  const bindings = [];

  if (username) {
    conditions.push("username = ?");
    bindings.push(username);
    conditions.push("student_id = ?");
    bindings.push(username);
  }

  if (email) {
    conditions.push("email = ?");
    bindings.push(email);
  }

  if (studentId) {
    conditions.push("student_id = ?");
    bindings.push(studentId);
    conditions.push("username = ?");
    bindings.push(studentId);
  }

  if (!conditions.length) {
    return null;
  }

  let sql = `
    SELECT id, username, email, student_id
    FROM users
    WHERE (${conditions.join(" OR ")})
  `;

  if (excludeUserId !== null) {
    sql += " AND id != ?";
    bindings.push(excludeUserId);
  }

  sql += " LIMIT 1";

  return db
    .prepare(sql)
    .bind(...bindings)
    .first();
}

async function isRegistrationEnabled(db) {
  const row = await db
    .prepare(
      `
    SELECT setting_value
    FROM site_settings
    WHERE setting_key = 'registration_enabled'
    LIMIT 1
  `,
    )
    .first();

  const rawValue = row?.setting_value ?? "1";
  return ENABLED_SETTING_VALUES.has(`${rawValue}`.trim().toLowerCase());
}

function resolveJwtExpiresInSeconds(expiresIn) {
  if (typeof expiresIn === "number" && Number.isFinite(expiresIn)) {
    return Math.max(Math.floor(expiresIn), 1);
  }

  const normalized = `${expiresIn || ""}`.trim();
  if (!normalized) {
    return DEFAULT_JWT_EXPIRES_IN_SECONDS;
  }

  if (/^\d+$/.test(normalized)) {
    return Math.max(Number.parseInt(normalized, 10), 1);
  }

  const match = normalized.match(/^(\d+)\s*([smhdw])$/i);
  if (!match) {
    return DEFAULT_JWT_EXPIRES_IN_SECONDS;
  }

  const value = Math.max(Number.parseInt(match[1], 10), 1);
  const unit = `${match[2] || ""}`.toLowerCase();
  const unitSeconds = JWT_DURATION_UNIT_IN_SECONDS[unit] || 1;

  return value * unitSeconds;
}

async function createToken(env, user) {
  const jwtConfig = getJwtConfig(env);
  const jwtSecret = getJwtSecret(env);
  const nowTimestamp = Math.floor(Date.now() / 1000);
  const expiresInSeconds = resolveJwtExpiresInSeconds(jwtConfig.expiresIn);

  return sign(
    {
      sub: String(user.id),
      id: user.id,
      username: user.username,
      role: user.role,
      iss: jwtConfig.issuer,
      aud: jwtConfig.audience,
      iat: nowTimestamp,
      exp: nowTimestamp + expiresInSeconds,
    },
    jwtSecret,
    jwtConfig.algorithm,
  );
}

app.post("/register", async (c) => {
  const rateLimitResponse = await enforceRateLimit(c, {
    scope: "auth-register",
    key: getClientIp(c),
    limit: 6,
    windowSeconds: 15 * 60,
    message: "注册请求过于频繁，请稍后再试",
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const installationStatus = await getInstallationStatus(c.env.DB);
    if (installationStatus.setupRequired) {
      return createSetupRequiredResponse(c);
    }

    if (!(await isRegistrationEnabled(c.env.DB))) {
      return c.json({ error: "注册功能已关闭" }, 403);
    }

    const body = await c.req.json();
    const username = normalizeRequiredString(body.username);
    const email = normalizeEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";
    const realName = normalizeOptionalString(body.real_name);
    const studentId = normalizeOptionalString(body.student_id);
    const storedEmail = toStoredEmail(email, studentId || username);

    const validationErrors = [
      validateUsername(username),
      validateEmail(email),
      validatePassword(password),
      validateRealName(realName),
      validateStudentId(studentId),
    ].filter(Boolean);

    if (validationErrors.length) {
      return c.json({ error: validationErrors[0] }, 400);
    }

    const existingUser = await findConflictingUser(c.env.DB, {
      username,
      email,
      studentId,
    });

    if (existingUser) {
      return c.json({ error: "用户名、邮箱或学号已存在" }, 400);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await c.env.DB.prepare(
      `
      INSERT INTO users (username, email, password_hash, real_name, student_id)
      VALUES (?, ?, ?, ?, ?)
    `,
    )
      .bind(username, storedEmail, passwordHash, realName, studentId)
      .run();

    const createdUser = await c.env.DB.prepare(
      `
      SELECT id, username, email, role, real_name, student_id, avatar_url
      FROM users
      WHERE id = ?
    `,
    )
      .bind(result.meta.last_row_id)
      .first();

    await recordAuditLog(c.env.DB, {
      ...getAuditContext(c),
      actorId: result.meta.last_row_id,
      action: "auth.register",
      targetType: "user",
      targetId: result.meta.last_row_id,
      summary: `新用户 ${username} 完成注册`,
    });

    c.header("Cache-Control", "no-store");
    return c.json(
      {
        message: "注册成功",
        user: sanitizeUser(createdUser),
      },
      201,
    );
  } catch (error) {
    console.error("Register error:", error);
    return c.json({ error: "注册失败，请稍后再试" }, 500);
  }
});

app.post("/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  const account = normalizeRequiredString(
    body?.account || body?.username || body?.email,
  );

  const rateLimitResponse = await enforceRateLimit(c, {
    scope: "auth-login",
    key: `${getClientIp(c)}:${account || "anonymous"}`,
    limit: 10,
    windowSeconds: 15 * 60,
    message: "登录尝试次数过多，请 15 分钟后再试",
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const installationStatus = await getInstallationStatus(c.env.DB);
    if (installationStatus.setupRequired) {
      return createSetupRequiredResponse(c);
    }

    const password = typeof body?.password === "string" ? body.password : "";
    const captcha = normalizeCaptchaInput(body?.captcha);
    const clientIp = getClientIp(c);
    const scopeKey = buildLoginAttemptKey(clientIp, account);

    await cleanupExpiredLoginAttempts(c.env.DB);

    if (!account || !password) {
      return c.json({ error: "请输入账号和密码" }, 400);
    }

    const loginAttempt = await getLoginAttemptRecord(c.env.DB, scopeKey);
    const requiresCaptcha = Number(loginAttempt?.failed_attempts || 0) >= 1;

    if (requiresCaptcha) {
      if (!captcha) {
        const challenge = isCaptchaExpired(loginAttempt?.captcha_expires_at)
          ? await issueLoginCaptcha(
              c.env.DB,
              scopeKey,
              Number(loginAttempt.failed_attempts || 1),
            )
          : {
              require_captcha: true,
              captcha_image: createCaptchaImageDataUrl(
                loginAttempt.captcha_code,
              ),
              captcha_expires_at: loginAttempt.captcha_expires_at,
            };
        return c.json(
          {
            error: "请输入数字验证码",
            ...challenge,
          },
          400,
        );
      }

      if (
        isCaptchaExpired(loginAttempt?.captcha_expires_at) ||
        captcha !== `${loginAttempt?.captcha_code || ""}`
      ) {
        const challenge = await issueLoginCaptcha(
          c.env.DB,
          scopeKey,
          Number(loginAttempt?.failed_attempts || 1),
        );
        return c.json(
          {
            error: "验证码错误或已过期，请重新输入",
            ...challenge,
          },
          400,
        );
      }
    }

    const normalizedEmail = account.includes("@")
      ? normalizeEmail(account)
      : account;

    const user = await c.env.DB.prepare(
      `
      SELECT *
      FROM users
      WHERE username = ? OR student_id = ? OR email = ?
      ORDER BY CASE
        WHEN username = ? THEN 0
        WHEN student_id = ? THEN 1
        ELSE 2
      END
      LIMIT 1
    `,
    )
      .bind(account, account, normalizedEmail, account, account)
      .first();

    if (!user) {
      const challenge = await issueLoginCaptcha(
        c.env.DB,
        scopeKey,
        Number(loginAttempt?.failed_attempts || 0) + 1,
      );

      await recordAuditLog(c.env.DB, {
        ...getAuditContext(c),
        action: "auth.login_failed",
        targetType: "auth",
        summary: `未知账号 ${account} 登录失败`,
      });

      return c.json(
        {
          error: "账号或密码错误",
          ...challenge,
        },
        401,
      );
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      const challenge = await issueLoginCaptcha(
        c.env.DB,
        scopeKey,
        Number(loginAttempt?.failed_attempts || 0) + 1,
      );

      await recordAuditLog(c.env.DB, {
        ...getAuditContext(c),
        actorId: user.id,
        action: "auth.login_failed",
        targetType: "user",
        targetId: user.id,
        summary: `用户 ${user.username} 登录失败`,
      });

      return c.json(
        {
          error: "账号或密码错误",
          ...challenge,
        },
        401,
      );
    }

    await clearLoginAttemptRecord(c.env.DB, scopeKey);

    await c.env.DB.prepare(
      `
      UPDATE users
      SET last_login = ${SQL_NOW_UTC8}
      WHERE id = ?
    `,
    )
      .bind(user.id)
      .run();

    const token = await createToken(c.env, user);

    await recordAuditLog(c.env.DB, {
      ...getAuditContext(c),
      actorId: user.id,
      action: "auth.login",
      targetType: "user",
      targetId: user.id,
      summary: `用户 ${user.username} 登录成功`,
    });

    c.header("Cache-Control", "no-store");
    return c.json({
      token,
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error("Login error:", error);
    return c.json({ error: "登录失败，请稍后再试" }, 500);
  }
});

app.get("/me", authMiddleware, async (c) => {
  try {
    const currentUser = c.get("user");

    const user = await c.env.DB.prepare(
      `
      SELECT id, username, email, role, real_name, student_id, avatar_url
      FROM users
      WHERE id = ?
    `,
    )
      .bind(currentUser.id)
      .first();

    if (!user) {
      return c.json({ error: "用户不存在" }, 404);
    }

    c.header("Cache-Control", "no-store");
    return c.json({ user: sanitizeUser(user) });
  } catch (error) {
    console.error("Get current user error:", error);
    return c.json({ error: "获取当前用户信息失败" }, 500);
  }
});

export default app;
