import { Hono } from "hono";
import { cors } from "hono/cors";
import authRoutes from "./routes/auth.js";
import usersRoutes from "./routes/users.js";
import materialsRoutes from "./routes/materials.js";
import assignmentsRoutes from "./routes/assignments.js";
import postsRoutes from "./routes/posts.js";
import settingsRoutes from "./routes/settings.js";
import dashboardRoutes from "./routes/dashboard.js";
import notificationsRoutes from "./routes/notifications.js";
import installRoutes from "./routes/install.js";
import { initializeDatabase } from "./db/init.js";
import { ensureRuntimeConfig, resolveCorsOrigin } from "./utils/env.js";
import { applySecurityHeaders, createErrorResponse } from "./utils/security.js";

const app = new Hono();

let runtimeValidated = false;
let runtimeValidationPromise = null;
let dbInitialized = false;
let dbInitializationPromise = null;

function hasD1Binding(env = {}) {
  return Boolean(env?.DB) && typeof env.DB.prepare === "function";
}

function createFastHealthResponse() {
  return Response.json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
      mode: "fast",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

async function ensureRuntimeValidated(env) {
  if (runtimeValidated) {
    return;
  }

  if (!runtimeValidationPromise) {
    runtimeValidationPromise = ensureRuntimeConfig(env, env.DB)
      .then(() => {
        runtimeValidated = true;
      })
      .catch((error) => {
        runtimeValidationPromise = null;
        throw error;
      });
  }

  await runtimeValidationPromise;
}

async function ensureDatabaseInitialized(env) {
  if (dbInitialized) {
    return;
  }

  if (!dbInitializationPromise) {
    dbInitializationPromise = initializeDatabase(env.DB, env)
      .then(() => {
        dbInitialized = true;
      })
      .catch((error) => {
        dbInitializationPromise = null;
        throw error;
      });
  }

  await dbInitializationPromise;
}

app.use("/api/*", async (c, next) => {
  const requestOrigin = c.req.header("Origin") || "";
  const resolvedOrigin = await resolveCorsOrigin(
    requestOrigin,
    c.env,
    c.req.url,
  );

  const corsMiddleware = cors({
    origin: () => resolvedOrigin || undefined,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["Content-Disposition", "Content-Length", "Content-Type"],
    maxAge: 86400,
  });

  return corsMiddleware(c, next);
});

app.use("*", async (c, next) => {
  if (c.req.path === "/api/health") {
    await next();
    return;
  }

  if (!hasD1Binding(c.env)) {
    return c.json(
      {
        error:
          "缺少 D1 数据库绑定 DB，请在 Pages 项目 设置 -> 绑定 中绑定 D1（名称必须为 DB）后重新部署。记得也要绑定R2用于文件存储哦！",
      },
      503,
    );
  }

  if (!dbInitialized) {
    await ensureDatabaseInitialized(c.env);
  }

  if (!runtimeValidated) {
    await ensureRuntimeValidated(c.env);
  }

  await next();
});

app.use("*", async (c, next) => {
  await next();
  applySecurityHeaders(c);
});

app.route("/api/auth", authRoutes);
app.route("/api/users", usersRoutes);
app.route("/api/materials", materialsRoutes);
app.route("/api/assignments", assignmentsRoutes);
app.route("/api/posts", postsRoutes);
app.route("/api/settings", settingsRoutes);
app.route("/api/dashboard", dashboardRoutes);
app.route("/api/notifications", notificationsRoutes);
app.route("/api/install", installRoutes);

app.get("/api/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

app.notFound((c) => {
  return c.json({ error: "资源不存在" }, 404);
});

app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return createErrorResponse(err, c);
});

const SPA_ENTRY_PATH = "/index.html";
const STATIC_FILE_PATH_PATTERN = /\.[A-Za-z0-9]+$/;

function isApiRequest(pathname = "") {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function shouldBypassSpaFallback(pathname = "") {
  return (
    pathname.startsWith("/assets/") || STATIC_FILE_PATH_PATTERN.test(pathname)
  );
}

async function serveFrontendAsset(request, env) {
  if (!env?.ASSETS || typeof env.ASSETS.fetch !== "function") {
    return new Response("前端静态资源尚未部署", {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  const staticResponse = await env.ASSETS.fetch(request);
  if (staticResponse.status !== 404) {
    return staticResponse;
  }

  const requestUrl = new URL(request.url);
  if (
    requestUrl.pathname === SPA_ENTRY_PATH ||
    isApiRequest(requestUrl.pathname) ||
    shouldBypassSpaFallback(requestUrl.pathname)
  ) {
    return staticResponse;
  }

  // SPA history fallback: return index.html for non-file routes.
  const fallbackRequest = new Request(
    new URL(SPA_ENTRY_PATH, request.url),
    request,
  );
  const fallbackResponse = await env.ASSETS.fetch(fallbackRequest);
  return fallbackResponse.status === 404 ? staticResponse : fallbackResponse;
}

export default {
  async fetch(request, env, ctx) {
    const requestPathname = new URL(request.url).pathname;

    if (requestPathname === "/api/health") {
      return createFastHealthResponse();
    }

    if (isApiRequest(requestPathname)) {
      return app.fetch(request, env, ctx);
    }

    return serveFrontendAsset(request, env);
  },
};
