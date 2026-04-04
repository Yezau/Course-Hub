import { Hono } from "hono";
import { verify } from "hono/jwt";
import { completeInstallation, getInstallationStatus } from "../db/init.js";
import { getJwtConfig, getJwtSecret } from "../utils/env.js";
import { enforceRateLimit } from "../utils/rate-limit.js";
import { getClientIp } from "../utils/security.js";

const app = new Hono();

function isAudienceMatched(tokenAudience, expectedAudience) {
  if (Array.isArray(tokenAudience)) {
    return tokenAudience.includes(expectedAudience);
  }

  return `${tokenAudience || ""}` === expectedAudience;
}

async function resolveAuthorizedUser(c) {
  const authHeader = c.req.header("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return null;
  }

  const jwtConfig = getJwtConfig(c.env);
  const jwtSecret = getJwtSecret(c.env);

  try {
    const decoded = await verify(token, jwtSecret, jwtConfig.algorithm);

    if (`${decoded.iss || ""}` !== jwtConfig.issuer) {
      return null;
    }

    if (!isAudienceMatched(decoded.aud, jwtConfig.audience)) {
      return null;
    }

    const userId = Number.parseInt(decoded.id || decoded.sub, 10);
    if (!Number.isFinite(userId)) {
      return null;
    }

    return {
      id: userId,
      role: decoded.role,
    };
  } catch (error) {
    return null;
  }
}

app.get("/status", async (c) => {
  try {
    const status = await getInstallationStatus(c.env.DB);
    c.header("Cache-Control", "no-store");

    // Allow public check only before the first installation is complete.
    if (status.setupRequired) {
      return c.json({
        setup_required: true,
        available: true,
      });
    }

    const user = await resolveAuthorizedUser(c);
    if (!user) {
      return c.json(
        {
          error: "安装状态仅允许管理员访问",
          code: "AUTH_REQUIRED",
          setup_required: false,
          available: true,
        },
        401,
      );
    }

    if (user.role !== "admin") {
      return c.json(
        {
          error: "没有访问安装状态的权限",
          code: "FORBIDDEN",
          setup_required: false,
          available: true,
        },
        403,
      );
    }

    return c.json({
      setup_required: status.setupRequired,
      has_admin: status.hasAdmin,
      user_count: status.userCount,
      available: true,
    });
  } catch (error) {
    console.error("Load installation status error:", error);
    c.header("Cache-Control", "no-store");
    return c.json(
      {
        error: "安装状态暂不可用，请稍后重试",
        setup_required: false,
        has_admin: false,
        user_count: 0,
        available: false,
      },
      503,
    );
  }
});

app.post("/setup", async (c) => {
  const rateLimitResponse = await enforceRateLimit(c, {
    scope: "install-setup",
    key: getClientIp(c),
    limit: 10,
    windowSeconds: 10 * 60,
    message: "安装请求过于频繁，请稍后再试",
  });

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const body = await c.req.json().catch(() => null);

  try {
    const result = await completeInstallation(c.env.DB, body || {}, c.env);
    c.header("Cache-Control", "no-store");

    return c.json(
      {
        message: "安装向导完成，管理员账号已创建",
        setup_required: false,
        admin_username: result.adminUsername,
        course_name: result.courseName,
        course_semester: result.defaultSemester,
      },
      201,
    );
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    const message =
      status >= 500
        ? "安装失败，请稍后重试"
        : error?.message || "安装失败，请检查输入后重试";

    c.header("Cache-Control", "no-store");

    return c.json({ error: message }, status);
  }
});

export default app;
