import { verify } from "hono/jwt";
import { getJwtConfig, getJwtSecret } from "../utils/env.js";

const QUERY_TOKEN_ALLOWED_PATHS = [
  /^\/api\/materials\/[^/]+\/download(?:\/|$)/i,
  /^\/api\/assignments\/[^/]+\/attachments\/[^/]+\/download(?:\/|$)/i,
  /^\/api\/assignments\/submissions\/[^/]+\/attachments\/[^/]+\/download(?:\/|$)/i,
  /^\/api\/posts\/media\/[^/]+\/file(?:\/|$)/i,
];

function canUseQueryToken(c) {
  if (c.req.method !== "GET") {
    return false;
  }

  const requestPath = c.req.path || "";
  return QUERY_TOKEN_ALLOWED_PATHS.some((pattern) => pattern.test(requestPath));
}

function isAudienceMatched(tokenAudience, expectedAudience) {
  if (Array.isArray(tokenAudience)) {
    return tokenAudience.includes(expectedAudience);
  }

  return `${tokenAudience || ""}` === expectedAudience;
}

export async function authMiddleware(c, next) {
  const authHeader = c.req.header("Authorization");
  const tokenFromQuery = canUseQueryToken(c) ? c.req.query("token") : "";

  if ((!authHeader || !authHeader.startsWith("Bearer ")) && !tokenFromQuery) {
    return c.json({ error: "未登录或登录状态已失效" }, 401);
  }

  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : `${tokenFromQuery || ""}`.trim();
  const jwtConfig = getJwtConfig(c.env);
  const jwtSecret = getJwtSecret(c.env);

  try {
    const decoded = await verify(token, jwtSecret, jwtConfig.algorithm);

    if (`${decoded.iss || ""}` !== jwtConfig.issuer) {
      return c.json({ error: "登录凭证无效" }, 401);
    }

    if (!isAudienceMatched(decoded.aud, jwtConfig.audience)) {
      return c.json({ error: "登录凭证无效" }, 401);
    }

    const userId = Number.parseInt(decoded.id || decoded.sub, 10);
    if (!Number.isFinite(userId)) {
      return c.json({ error: "登录凭证无效" }, 401);
    }

    c.set("user", {
      id: userId,
      username: decoded.username,
      role: decoded.role,
    });

    await next();
  } catch (error) {
    return c.json({ error: "登录凭证已过期或无效" }, 401);
  }
}

export function requireRole(...roles) {
  return async (c, next) => {
    const user = c.get("user");

    if (!user || !roles.includes(user.role)) {
      return c.json({ error: "没有访问该资源的权限" }, 403);
    }

    await next();
  };
}
