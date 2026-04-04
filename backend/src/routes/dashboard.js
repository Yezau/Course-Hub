import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { getStorageOverview } from "../utils/storage-quota.js";

const app = new Hono();

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function countBySql(db, sql, ...bindings) {
  const result = await db
    .prepare(sql)
    .bind(...bindings)
    .first();
  return toNumber(result?.count);
}

app.use("/*", authMiddleware);

app.get("/", async (c) => {
  try {
    const user = c.get("user");

    const [materialsCount, assignmentsCount, postsCount, submissionsCount] =
      await Promise.all([
        countBySql(c.env.DB, "SELECT COUNT(*) AS count FROM materials"),
        countBySql(c.env.DB, "SELECT COUNT(*) AS count FROM assignments"),
        countBySql(c.env.DB, "SELECT COUNT(*) AS count FROM posts"),
        user.role === "student"
          ? countBySql(
              c.env.DB,
              "SELECT COUNT(*) AS count FROM submissions WHERE student_id = ?",
              user.id,
            )
          : countBySql(c.env.DB, "SELECT COUNT(*) AS count FROM submissions"),
      ]);

    let storage = null;

    if (user.role !== "student") {
      const storageOverview = await getStorageOverview(c.env, c.env.DB);

      storage = {
        quota_bytes: storageOverview.quotaBytes,
        used_bytes: storageOverview.usedBytes,
        usage_source: storageOverview.usageSource,
        quota_source: storageOverview.quotaSource,
        estimated: storageOverview.usageSource !== "r2-metrics-api",
      };
    }

    return c.json({
      stats: {
        materials: materialsCount,
        assignments: assignmentsCount,
        posts: postsCount,
        submissions: submissionsCount,
      },
      storage,
    });
  } catch (error) {
    console.error("Get dashboard overview error:", error);
    return c.json({ error: "获取仪表盘数据失败" }, 500);
  }
});

export default app;
