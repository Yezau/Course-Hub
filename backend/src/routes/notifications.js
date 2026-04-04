import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";

const notifications = new Hono();

// 获取通知列表
notifications.get("/", authMiddleware, async (c) => {
  try {
    const db = c.env.DB;
    const user = c.get("user");
    const requestedLimit = parseInt(c.req.query("limit"), 10);
    const requestedOffset = parseInt(c.req.query("offset"), 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 100)
      : 20;
    const offset = Number.isFinite(requestedOffset)
      ? Math.max(requestedOffset, 0)
      : 0;

    const { results } = await db
      .prepare(
        `
      SELECT n.*, u.username as actor_name, u.avatar_url as actor_avatar
      FROM notifications n
      LEFT JOIN users u ON n.actor_id = u.id
      WHERE n.user_id = ?
      ORDER BY n.created_at DESC
      LIMIT ? OFFSET ?
    `,
      )
      .bind(user.id, limit, offset)
      .all();

    return c.json(results);
  } catch (error) {
    console.error("Get notifications error:", error);
    return c.json({ error: "获取通知失败", details: error.message }, 500);
  }
});

// 获取未读数量
notifications.get("/unread-count", authMiddleware, async (c) => {
  try {
    const db = c.env.DB;
    const user = c.get("user");
    const { results } = await db
      .prepare(
        `
      SELECT COUNT(*) as count
      FROM notifications
      WHERE user_id = ? AND is_read = 0
    `,
      )
      .bind(user.id)
      .all();

    const count = results.length > 0 ? results[0].count : 0;

    return c.json({ count: count });
  } catch (error) {
    console.error("Get unread notifications count error:", error);
    return c.json({ error: "获取未读数量失败" }, 500);
  }
});

// 标记单条为已读
notifications.put("/:id/read", authMiddleware, async (c) => {
  try {
    const db = c.env.DB;
    const user = c.get("user");
    const id = c.req.param("id");
    await db
      .prepare(
        `
      UPDATE notifications
      SET is_read = 1
      WHERE id = ? AND user_id = ?
    `,
      )
      .bind(id, user.id)
      .run();

    return c.json({ success: true });
  } catch (error) {
    console.error("Mark notification as read error:", error);
    return c.json({ error: "更新失败" }, 500);
  }
});

// 标记所有已读
notifications.put("/read-all", authMiddleware, async (c) => {
  try {
    const db = c.env.DB;
    const user = c.get("user");
    await db
      .prepare(
        `
      UPDATE notifications
      SET is_read = 1
      WHERE user_id = ? AND is_read = 0
    `,
      )
      .bind(user.id)
      .run();

    return c.json({ success: true });
  } catch (error) {
    console.error("Mark all notifications as read error:", error);
    return c.json({ error: "更新失败" }, 500);
  }
});

export default notifications;
