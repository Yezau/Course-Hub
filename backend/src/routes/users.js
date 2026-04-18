import { Hono } from "hono";
import bcrypt from "bcryptjs";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import { getAuditContext, recordAuditLog } from "../utils/audit.js";
import { toPublicEmail, toStoredEmail } from "../utils/user-email.js";
import {
  createPublicFileResponse,
  validateImageFile,
} from "../utils/uploads.js";
import {
  normalizeEmail,
  normalizeOptionalString,
  normalizeRequiredString,
  validateAvatarUrl,
  validateEmail,
  validatePassword,
  validateRealName,
  validateStudentId,
  validateUsername,
} from "../utils/validation.js";
import { enforceRateLimit } from "../utils/rate-limit.js";
import { ensureStorageQuotaForIncomingBytes } from "../utils/storage-quota.js";

const app = new Hono();
const SQL_NOW_UTC8 = "datetime('now', '+8 hours')";

app.get("/search", authMiddleware, async (c) => {
  try {
    const currentUser = c.get("user");
    const rateLimitedResponse = await enforceRateLimit(c, {
      scope: "users-search",
      key: `user:${currentUser?.id || "unknown"}`,
      limit: 240,
      windowSeconds: 60,
      message: "搜索过于频繁，请稍后再试",
    });

    if (rateLimitedResponse) {
      return rateLimitedResponse;
    }

    const q = c.req.query("q") || "";
    const term = `%${q}%`;
    const { results } = await c.env.DB.prepare(
      `
      SELECT id, username, avatar_url, real_name
      FROM users
      WHERE username LIKE ? OR real_name LIKE ?
      LIMIT 10
    `,
    )
      .bind(term, term)
      .all();
    return c.json(results || []);
  } catch (err) {
    return c.json({ error: "Search failed" }, 500);
  }
});

const VALID_ROLES = new Set(["admin", "teacher", "student"]);
const BATCH_CREATE_LIMIT = 200;
const BATCH_CREATE_CHUNK_SIZE = 50;
const BATCH_DELETE_LIMIT = 200;
const buildAvatarObjectKey = (userId) => `avatars/users/${userId}/avatar`;
const buildAvatarUrl = (userId) =>
  `/users/${userId}/avatar/file?v=${Date.now()}`;

function isManagedAvatarUrl(userId, avatarUrl) {
  const normalizedAvatarUrl = normalizeOptionalString(avatarUrl);
  if (!normalizedAvatarUrl) {
    return false;
  }

  try {
    const parsed = new URL(normalizedAvatarUrl, "https://course.local");
    return [
      `/users/${userId}/avatar/file`,
      `/api/users/${userId}/avatar/file`,
    ].includes(parsed.pathname);
  } catch (error) {
    return false;
  }
}

const USER_DELETE_BLOCKERS = [
  {
    key: "material_folders",
    label: "material folders",
    table: "material_folders",
    ownerColumn: "creator_id",
  },
  {
    key: "materials",
    label: "materials",
    table: "materials",
    ownerColumn: "uploader_id",
  },
  {
    key: "assignments",
    label: "assignments",
    table: "assignments",
    ownerColumn: "created_by",
  },
  {
    key: "submissions",
    label: "submissions",
    table: "submissions",
    ownerColumn: "student_id",
  },
  {
    key: "posts",
    label: "posts",
    table: "posts",
    ownerColumn: "author_id",
  },
  {
    key: "replies",
    label: "replies",
    table: "replies",
    ownerColumn: "author_id",
  },
];
const USER_DELETE_NULLIFIERS = [
  { table: "assignments", column: "closed_by" },
  { table: "submissions", column: "graded_by" },
  { table: "site_settings", column: "updated_by" },
];

function hasOwnProperty(target, key) {
  return Object.prototype.hasOwnProperty.call(target, key);
}

function parsePositiveInteger(value, fallback = null) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

function normalizeEmailDomain(value) {
  const normalized = normalizeOptionalString(value)?.replace(/^@+/, "");
  return normalized || null;
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
    created_at: user.created_at,
    updated_at: user.updated_at,
    last_login: user.last_login,
  };
}

async function loadUserById(db, userId) {
  return db
    .prepare(
      `
    SELECT
      id,
      username,
      email,
      role,
      real_name,
      student_id,
      avatar_url,
      created_at,
      updated_at,
      last_login
    FROM users
    WHERE id = ?
  `,
    )
    .bind(userId)
    .first();
}

async function countAdmins(db) {
  const result = await db
    .prepare(
      `
    SELECT COUNT(*) AS count
    FROM users
    WHERE role = 'admin'
  `,
    )
    .first();

  return Number(result?.count || 0);
}

function normalizeUserIds(values = []) {
  return Array.from(
    new Set(
      values
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => Number.isFinite(value)),
    ),
  );
}

async function getUserDeleteBlockersMap(db, userIds = []) {
  const normalizedUserIds = normalizeUserIds(userIds);
  const blockersByUserId = new Map(
    normalizedUserIds.map((userId) => [userId, []]),
  );

  if (!normalizedUserIds.length) {
    return blockersByUserId;
  }

  const placeholders = normalizedUserIds.map(() => "?").join(", ");

  for (const blocker of USER_DELETE_BLOCKERS) {
    const result = await db
      .prepare(
        `
        SELECT ${blocker.ownerColumn} AS user_id, COUNT(*) AS count
        FROM ${blocker.table}
        WHERE ${blocker.ownerColumn} IN (${placeholders})
        GROUP BY ${blocker.ownerColumn}
      `,
      )
      .bind(...normalizedUserIds)
      .all();

    for (const row of result.results || []) {
      const userId = Number(row?.user_id);
      const count = Number(row?.count || 0);
      if (!Number.isFinite(userId) || count < 1) {
        continue;
      }

      const blockers = blockersByUserId.get(userId) || [];
      blockers.push({
        key: blocker.key,
        label: blocker.label,
        count,
      });
      blockersByUserId.set(userId, blockers);
    }
  }

  return blockersByUserId;
}

async function getUserDeleteBlockers(db, userId) {
  const blockersMap = await getUserDeleteBlockersMap(db, [userId]);
  return blockersMap.get(Number(userId)) || [];
}

async function clearUserDeleteNullableReferences(db, userId) {
  for (const item of USER_DELETE_NULLIFIERS) {
    await db
      .prepare(
        `
      UPDATE ${item.table}
      SET ${item.column} = NULL
      WHERE ${item.column} = ?
    `,
      )
      .bind(userId)
      .run();
  }
}

function formatUserDeleteBlockersMessage(username, blockers) {
  const dependencySummary = blockers
    .map((item) => `${item.label}: ${item.count}`)
    .join(", ");

  return `Cannot delete user ${username} because related records still exist (${dependencySummary}).`;
}

function canTeacherManageTarget(currentUser, targetUser) {
  return currentUser?.role === "teacher" && targetUser?.role === "student";
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

function validateRole(role) {
  if (!VALID_ROLES.has(role)) {
    return "角色值无效";
  }

  return "";
}

async function createUserRecord(db, payload) {
  const username = normalizeRequiredString(payload.username);
  const role = normalizeRequiredString(payload.role || "student") || "student";
  const realName = normalizeOptionalString(payload.real_name);
  const studentId = normalizeOptionalString(payload.student_id);
  const avatarUrl = normalizeOptionalString(payload.avatar_url);
  const email = normalizeEmail(payload.email);
  const storedEmail = toStoredEmail(email, studentId || username);
  let passwordHash = payload.password_hash || null;

  const validationErrors = [
    validateUsername(username),
    validateEmail(email),
    validateRole(role),
    validateRealName(realName),
    validateStudentId(studentId),
    validateAvatarUrl(avatarUrl),
  ].filter(Boolean);

  if (!passwordHash) {
    const password =
      typeof payload.password === "string" ? payload.password : "";
    const passwordError = validatePassword(password);
    if (passwordError) {
      validationErrors.push(passwordError);
    } else {
      passwordHash = await bcrypt.hash(password, 10);
    }
  }

  if (validationErrors.length) {
    const error = new Error(validationErrors[0]);
    error.status = 400;
    throw error;
  }

  const existingUser = await findConflictingUser(db, {
    username,
    email,
    studentId,
  });

  if (existingUser) {
    const error = new Error("用户名、邮箱或学号已存在");
    error.status = 400;
    throw error;
  }

  if (role === "admin") {
    const adminCount = await countAdmins(db);
    if (adminCount >= 1) {
      const error = new Error("系统仅允许一个管理员账号");
      error.status = 400;
      throw error;
    }
  }

  const result = await db
    .prepare(
      `
    INSERT INTO users (
      username,
      email,
      password_hash,
      role,
      real_name,
      student_id,
      avatar_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .bind(
      username,
      storedEmail,
      passwordHash,
      role,
      realName,
      studentId,
      avatarUrl,
    )
    .run();

  return loadUserById(db, result.meta.last_row_id);
}

app.get("/:id/avatar/file", async (c) => {
  const targetUserId = Number.parseInt(c.req.param("id"), 10);

  if (!Number.isFinite(targetUserId)) {
    return c.json({ error: "用户编号无效" }, 400);
  }

  const object = await c.env.BUCKET.get(buildAvatarObjectKey(targetUserId));

  if (!object?.body) {
    return c.json({ error: "头像不存在" }, 404);
  }

  return createPublicFileResponse(object, {
    fileName: `avatar-${targetUserId}`,
    contentType: "image/png",
  });
});

app.use("/*", authMiddleware);

app.get("/", requireRole("admin", "teacher"), async (c) => {
  try {
    const currentUser = c.get("user");
    const bindings = [];
    let query = `
      SELECT
        id,
        username,
        email,
        role,
        real_name,
        student_id,
        avatar_url,
        created_at,
        updated_at,
        last_login
      FROM users
    `;

    if (currentUser.role === "teacher") {
      query += " WHERE role = ?";
      bindings.push("student");
    }

    query += " ORDER BY created_at DESC, id DESC";

    const result = await c.env.DB.prepare(query)
      .bind(...bindings)
      .all();

    return c.json({
      users: (result.results || []).map(sanitizeUser),
    });
  } catch (error) {
    console.error("Get users error:", error);
    return c.json({ error: "获取用户列表失败" }, 500);
  }
});

app.post("/", requireRole("admin", "teacher"), async (c) => {
  try {
    const currentUser = c.get("user");
    const body = await c.req.json();
    const payload =
      currentUser.role === "teacher"
        ? {
            ...body,
            role: "student",
          }
        : body;
    const createdUser = await createUserRecord(c.env.DB, payload);

    await recordAuditLog(c.env.DB, {
      ...getAuditContext(c),
      action: "user.create",
      targetType: "user",
      targetId: createdUser.id,
      summary: `创建用户 ${createdUser.username}`,
    });

    return c.json(
      {
        message: "用户创建成功",
        user: sanitizeUser(createdUser),
      },
      201,
    );
  } catch (error) {
    console.error("Create user error:", error);
    return c.json(
      { error: error.message || "创建用户失败" },
      error.status || 500,
    );
  }
});

app.post("/batch", requireRole("admin", "teacher"), async (c) => {
  try {
    const body = await c.req.json();
    const studentIdPrefix = normalizeRequiredString(body.student_id_prefix);
    const startNumber = parsePositiveInteger(body.start_number, null);
    const count = parsePositiveInteger(body.count, null);
    const suffixLength = parsePositiveInteger(body.suffix_length, 3);
    const emailDomain = normalizeEmailDomain(body.email_domain);
    const defaultPassword =
      typeof body.default_password === "string" ? body.default_password : "";
    const realNamePrefix =
      normalizeOptionalString(body.real_name_prefix) || "学生";
    const avatarUrl = normalizeOptionalString(body.avatar_url);

    if (!studentIdPrefix) {
      return c.json({ error: "学号前缀不能为空" }, 400);
    }

    if (startNumber === null) {
      return c.json({ error: "起始序号必须为非负整数" }, 400);
    }

    if (count === null || count < 1) {
      return c.json({ error: "创建数量必须大于 0" }, 400);
    }

    if (count > BATCH_CREATE_LIMIT) {
      return c.json(
        { error: `单次最多只能批量创建 ${BATCH_CREATE_LIMIT} 个账号` },
        400,
      );
    }

    if (!suffixLength || suffixLength > 12) {
      return c.json({ error: "补零位数必须在 1 到 12 之间" }, 400);
    }

    const passwordError = validatePassword(defaultPassword);
    if (passwordError) {
      return c.json({ error: passwordError }, 400);
    }

    const avatarError = validateAvatarUrl(avatarUrl);
    if (avatarError) {
      return c.json({ error: avatarError }, 400);
    }

    const sharedPasswordHash = await bcrypt.hash(defaultPassword, 10);
    const preparedUsers = [];
    const createdStudentIds = [];
    const skipped = [];

    for (let offset = 0; offset < count; offset += 1) {
      const sequenceNumber = startNumber + offset;
      const suffix = String(sequenceNumber).padStart(suffixLength, "0");
      const studentId = `${studentIdPrefix}${suffix}`;

      const username = studentId;
      const realName = `${realNamePrefix}${suffix}`;
      const email = emailDomain ? `${studentId}@${emailDomain}` : null;
      const validationError = [
        validateUsername(username),
        validateStudentId(studentId),
        validateRealName(realName),
        validateEmail(email),
        validateAvatarUrl(avatarUrl),
      ].filter(Boolean)[0];

      if (validationError) {
        skipped.push({
          student_id: studentId,
          reason: validationError,
        });

        continue;
      }

      preparedUsers.push({
        studentId,
        username,
        email: toStoredEmail(email, studentId),
        realName,
        avatarUrl,
      });
    }

    for (
      let startIndex = 0;
      startIndex < preparedUsers.length;
      startIndex += BATCH_CREATE_CHUNK_SIZE
    ) {
      const chunk = preparedUsers.slice(
        startIndex,
        startIndex + BATCH_CREATE_CHUNK_SIZE,
      );
      const statements = chunk.map((item) =>
        c.env.DB.prepare(
          `
          INSERT OR IGNORE INTO users (
            username,
            email,
            password_hash,
            role,
            real_name,
            student_id,
            avatar_url
          ) VALUES (?, ?, ?, 'student', ?, ?, ?)
        `,
        ).bind(
          item.username,
          item.email,
          sharedPasswordHash,
          item.realName,
          item.studentId,
          item.avatarUrl,
        ),
      );

      const results = await c.env.DB.batch(statements);

      chunk.forEach((item, index) => {
        const changes = Number(results?.[index]?.meta?.changes || 0);
        if (changes > 0) {
          createdStudentIds.push(item.studentId);
          return;
        }

        skipped.push({
          student_id: item.studentId,
          reason: "用户名、邮箱或学号已存在",
        });
      });
    }

    let createdUsers = [];

    if (createdStudentIds.length) {
      const placeholders = createdStudentIds.map(() => "?").join(", ");
      const createdResult = await c.env.DB.prepare(
        `
          SELECT
            id,
            username,
            email,
            role,
            real_name,
            student_id,
            avatar_url,
            created_at,
            updated_at,
            last_login
          FROM users
          WHERE student_id IN (${placeholders})
        `,
      )
        .bind(...createdStudentIds)
        .all();

      const createdRowMap = new Map(
        (createdResult.results || []).map((row) => [row.student_id, row]),
      );

      createdUsers = createdStudentIds
        .map((studentId) => createdRowMap.get(studentId))
        .filter(Boolean)
        .map(sanitizeUser);
    }

    await recordAuditLog(c.env.DB, {
      ...getAuditContext(c),
      action: "user.batch_create",
      targetType: "user",
      summary: `批量创建学生账号，成功 ${createdUsers.length} 个，跳过 ${skipped.length} 个`,
      details: {
        created_count: createdUsers.length,
        skipped_count: skipped.length,
      },
    });

    return c.json(
      {
        message: `批量创建完成，成功 ${createdUsers.length} 个，跳过 ${skipped.length} 个`,
        created_count: createdUsers.length,
        skipped_count: skipped.length,
        created_users: createdUsers,
        skipped,
      },
      201,
    );
  } catch (error) {
    console.error("Batch create users error:", error);
    return c.json(
      { error: error.message || "批量创建失败" },
      error.status || 500,
    );
  }
});

app.post("/batch-delete", requireRole("admin", "teacher"), async (c) => {
  try {
    const currentUser = c.get("user");
    const body = await c.req.json().catch(() => ({}));
    const rawUserIds = Array.isArray(body?.user_ids) ? body.user_ids : [];

    if (!rawUserIds.length) {
      return c.json({ error: "请至少选择一个待删除账号" }, 400);
    }

    if (rawUserIds.length > BATCH_DELETE_LIMIT) {
      return c.json(
        { error: `单次最多只能批量删除 ${BATCH_DELETE_LIMIT} 个账号` },
        400,
      );
    }

    const targetUserIds = normalizeUserIds(rawUserIds);

    if (!targetUserIds.length) {
      return c.json({ error: "待删除账号编号无效" }, 400);
    }

    const placeholders = targetUserIds.map(() => "?").join(", ");
    const targetUsersResult = await c.env.DB.prepare(
      `
        SELECT id, username, role
        FROM users
        WHERE id IN (${placeholders})
      `,
    )
      .bind(...targetUserIds)
      .all();

    const targetUserMap = new Map(
      (targetUsersResult.results || []).map((item) => [Number(item.id), item]),
    );
    const blockersByUserId = await getUserDeleteBlockersMap(
      c.env.DB,
      targetUserIds,
    );

    let adminCount = await countAdmins(c.env.DB);
    const deletedUsers = [];
    const skipped = [];

    for (const targetUserId of targetUserIds) {
      if (Number(currentUser.id) === targetUserId) {
        skipped.push({
          id: targetUserId,
          reason: "不能删除当前登录账号",
        });
        continue;
      }

      const targetUser = targetUserMap.get(targetUserId);
      if (!targetUser) {
        skipped.push({
          id: targetUserId,
          reason: "用户不存在",
        });
        continue;
      }

      if (currentUser.role === "teacher" && targetUser.role !== "student") {
        skipped.push({
          id: targetUserId,
          username: targetUser.username,
          reason: "教师只能删除学生账号",
        });
        continue;
      }

      if (targetUser.role === "admin") {
        if (adminCount <= 1) {
          skipped.push({
            id: targetUserId,
            username: targetUser.username,
            reason: "系统至少需要保留一个管理员账号",
          });
          continue;
        }

        adminCount -= 1;
      }

      const blockers = blockersByUserId.get(targetUserId) || [];
      if (blockers.length) {
        skipped.push({
          id: targetUserId,
          username: targetUser.username,
          reason: formatUserDeleteBlockersMessage(
            targetUser.username,
            blockers,
          ),
          dependencies: blockers,
        });
        continue;
      }

      try {
        await clearUserDeleteNullableReferences(c.env.DB, targetUserId);

        await c.env.DB.prepare(
          `
            DELETE FROM users
            WHERE id = ?
          `,
        )
          .bind(targetUserId)
          .run();

        deletedUsers.push({
          id: targetUserId,
          username: targetUser.username,
          role: targetUser.role,
        });
      } catch (deleteError) {
        const errorMessage = String(deleteError?.message || "");
        if (errorMessage.includes("FOREIGN KEY constraint failed")) {
          skipped.push({
            id: targetUserId,
            username: targetUser.username,
            reason: "存在关联数据，无法删除",
          });
          continue;
        }

        skipped.push({
          id: targetUserId,
          username: targetUser.username,
          reason: deleteError?.message || "删除失败",
        });
      }
    }

    for (const user of deletedUsers) {
      try {
        await c.env.BUCKET.delete(buildAvatarObjectKey(user.id));
      } catch (bucketError) {
        console.error("Delete user avatar object error:", bucketError);
      }
    }

    if (deletedUsers.length) {
      await recordAuditLog(c.env.DB, {
        ...getAuditContext(c),
        action: "user.batch_delete",
        targetType: "user",
        summary: `批量删除账号，成功 ${deletedUsers.length} 个，跳过 ${skipped.length} 个`,
        details: {
          deleted_count: deletedUsers.length,
          skipped_count: skipped.length,
          deleted_user_ids: deletedUsers.map((item) => item.id),
        },
      });
    }

    return c.json({
      message: `批量删除完成，成功 ${deletedUsers.length} 个，跳过 ${skipped.length} 个`,
      deleted_count: deletedUsers.length,
      skipped_count: skipped.length,
      deleted_users: deletedUsers,
      skipped,
    });
  } catch (error) {
    console.error("Batch delete users error:", error);
    const errorMessage = String(error?.message || "");

    if (
      errorMessage.includes("SQLITE_BUSY") ||
      errorMessage.includes("database is locked")
    ) {
      return c.json({ error: "Database is busy. Please try again." }, 503);
    }

    return c.json({ error: "批量删除失败" }, 500);
  }
});

app.post("/:id/avatar", async (c) => {
  try {
    const currentUser = c.get("user");
    const targetUserId = Number.parseInt(c.req.param("id"), 10);

    if (!Number.isFinite(targetUserId)) {
      return c.json({ error: "用户编号无效" }, 400);
    }

    if (currentUser.id !== targetUserId && currentUser.role !== "admin") {
      return c.json({ error: "没有权限修改该用户头像" }, 403);
    }

    const existingUser = await loadUserById(c.env.DB, targetUserId);
    if (!existingUser) {
      return c.json({ error: "用户不存在" }, 404);
    }

    const formData = await c.req.formData();
    const file = formData.get("file");
    const fileError = validateImageFile(file, { label: "头像图片" });

    if (fileError) {
      return c.json({ error: fileError }, 400);
    }

    const incomingBytes = Number(file?.size || 0);
    if (incomingBytes > 0) {
      await ensureStorageQuotaForIncomingBytes(c.env, c.env.DB, incomingBytes);
    }

    await c.env.BUCKET.put(buildAvatarObjectKey(targetUserId), file.stream(), {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
    });

    const nextAvatarUrl = buildAvatarUrl(targetUserId);

    await c.env.DB.prepare(
      `
      UPDATE users
      SET avatar_url = ?, updated_at = ${SQL_NOW_UTC8}
      WHERE id = ?
    `,
    )
      .bind(nextAvatarUrl, targetUserId)
      .run();

    const updatedUser = await loadUserById(c.env.DB, targetUserId);

    await recordAuditLog(c.env.DB, {
      ...getAuditContext(c),
      action: "user.avatar_upload",
      targetType: "user",
      targetId: targetUserId,
      summary: `更新了用户 ${updatedUser.username} 的头像`,
      details: {
        file_size: file.size || 0,
      },
    });

    return c.json({
      message: "头像已更新",
      user: sanitizeUser(updatedUser),
    });
  } catch (error) {
    console.error("Upload avatar error:", error);
    const status = Number.isInteger(error?.status) ? error.status : 500;
    return c.json({ error: error?.message || "上传头像失败" }, status);
  }
});

app.get("/:id", async (c) => {
  try {
    const currentUser = c.get("user");
    const targetUserId = Number.parseInt(c.req.param("id"), 10);

    if (!Number.isFinite(targetUserId)) {
      return c.json({ error: "用户编号无效" }, 400);
    }

    const user = await loadUserById(c.env.DB, targetUserId);
    if (!user) {
      return c.json({ error: "用户不存在" }, 404);
    }

    if (
      currentUser.id !== targetUserId &&
      currentUser.role !== "admin" &&
      !canTeacherManageTarget(currentUser, user)
    ) {
      return c.json({ error: "没有权限查看该用户信息" }, 403);
    }

    return c.json({ user: sanitizeUser(user) });
  } catch (error) {
    console.error("Get user detail error:", error);
    return c.json({ error: "获取用户信息失败" }, 500);
  }
});

app.put("/:id", async (c) => {
  try {
    const currentUser = c.get("user");
    const targetUserId = Number.parseInt(c.req.param("id"), 10);

    if (!Number.isFinite(targetUserId)) {
      return c.json({ error: "用户编号无效" }, 400);
    }

    const existingUser = await loadUserById(c.env.DB, targetUserId);
    if (!existingUser) {
      return c.json({ error: "用户不存在" }, 404);
    }

    const isSelf = currentUser.id === targetUserId;
    const isAdmin = currentUser.role === "admin";
    const isTeacherManagingStudent = canTeacherManageTarget(
      currentUser,
      existingUser,
    );

    if (!isSelf && !isAdmin && !isTeacherManagingStudent) {
      return c.json({ error: "没有权限修改该用户" }, 403);
    }

    const body = await c.req.json();
    const canEditIdentityFields = isAdmin || isSelf || isTeacherManagingStudent;
    const canEditProfileFields = isAdmin || isSelf || isTeacherManagingStudent;
    const canEditStudentId =
      isAdmin ||
      isTeacherManagingStudent ||
      (isSelf && currentUser.role !== "student");
    const canResetPassword = isAdmin || isTeacherManagingStudent;

    if (hasOwnProperty(body, "role") && !isAdmin) {
      return c.json({ error: "仅管理员可以修改角色" }, 403);
    }

    if (hasOwnProperty(body, "password") && !canResetPassword) {
      return c.json({ error: "当前权限不能修改密码" }, 403);
    }

    if (hasOwnProperty(body, "student_id") && !canEditStudentId) {
      return c.json({ error: "学生不能修改学号" }, 403);
    }

    const existingPublicEmail = toPublicEmail(existingUser.email);
    const nextUsername =
      canEditIdentityFields && hasOwnProperty(body, "username")
        ? normalizeRequiredString(body.username)
        : existingUser.username;
    const nextEmail =
      canEditIdentityFields && hasOwnProperty(body, "email")
        ? normalizeEmail(body.email)
        : existingPublicEmail;
    const nextRole =
      isAdmin && hasOwnProperty(body, "role")
        ? normalizeRequiredString(body.role)
        : existingUser.role;

    if (nextRole === "admin" && existingUser.role !== "admin") {
      return c.json({ error: "系统仅允许一个管理员账号" }, 400);
    }

    const nextRealName =
      canEditProfileFields && hasOwnProperty(body, "real_name")
        ? normalizeOptionalString(body.real_name)
        : existingUser.real_name;
    const nextStudentId =
      canEditStudentId && hasOwnProperty(body, "student_id")
        ? normalizeOptionalString(body.student_id)
        : existingUser.student_id;
    const nextAvatarUrl =
      canEditProfileFields && hasOwnProperty(body, "avatar_url")
        ? normalizeOptionalString(body.avatar_url)
        : existingUser.avatar_url;
    const nextStoredEmail =
      canEditIdentityFields && hasOwnProperty(body, "email")
        ? toStoredEmail(nextEmail, nextStudentId || nextUsername)
        : existingUser.email;
    const hadManagedAvatar = isManagedAvatarUrl(
      targetUserId,
      existingUser.avatar_url,
    );
    const keepsManagedAvatar = isManagedAvatarUrl(targetUserId, nextAvatarUrl);

    const validationErrors = [
      validateUsername(nextUsername),
      validateEmail(nextEmail),
      validateRole(nextRole),
      validateRealName(nextRealName),
      validateStudentId(nextStudentId),
      validateAvatarUrl(nextAvatarUrl),
    ].filter(Boolean);

    if (canResetPassword && hasOwnProperty(body, "password") && body.password) {
      const passwordError = validatePassword(body.password);
      if (passwordError) {
        validationErrors.push(passwordError);
      }
    }

    if (validationErrors.length) {
      return c.json({ error: validationErrors[0] }, 400);
    }

    const conflictingUser = await findConflictingUser(c.env.DB, {
      username: nextUsername,
      email: nextEmail,
      studentId: nextStudentId,
      excludeUserId: targetUserId,
    });

    if (conflictingUser) {
      return c.json({ error: "用户名、邮箱或学号已存在" }, 400);
    }

    if (existingUser.role === "admin" && nextRole !== "admin") {
      const adminCount = await countAdmins(c.env.DB);
      if (adminCount <= 1) {
        return c.json({ error: "系统至少需要保留一个管理员账号" }, 400);
      }
    }

    await c.env.DB.prepare(
      `
      UPDATE users
      SET
        username = ?,
        email = ?,
        role = ?,
        real_name = ?,
        student_id = ?,
        avatar_url = ?,
        updated_at = ${SQL_NOW_UTC8}
      WHERE id = ?
    `,
    )
      .bind(
        nextUsername,
        nextStoredEmail,
        nextRole,
        nextRealName,
        nextStudentId,
        nextAvatarUrl,
        targetUserId,
      )
      .run();

    if (
      canResetPassword &&
      typeof body.password === "string" &&
      body.password
    ) {
      const passwordHash = await bcrypt.hash(body.password, 10);
      await c.env.DB.prepare(
        `
        UPDATE users
        SET password_hash = ?, updated_at = ${SQL_NOW_UTC8}
        WHERE id = ?
      `,
      )
        .bind(passwordHash, targetUserId)
        .run();
    }

    if (hadManagedAvatar && !keepsManagedAvatar) {
      try {
        await c.env.BUCKET.delete(buildAvatarObjectKey(targetUserId));
      } catch (bucketError) {
        console.error("Delete outdated avatar object error:", bucketError);
      }
    }

    const updatedUser = await loadUserById(c.env.DB, targetUserId);

    await recordAuditLog(c.env.DB, {
      ...getAuditContext(c),
      action: "user.update",
      targetType: "user",
      targetId: targetUserId,
      summary: `更新了用户 ${updatedUser.username}`,
      details: {
        changed_password: Boolean(
          canResetPassword &&
          typeof body.password === "string" &&
          body.password,
        ),
        role: updatedUser.role,
      },
    });

    return c.json({
      message: "用户信息已更新",
      user: sanitizeUser(updatedUser),
    });
  } catch (error) {
    console.error("Update user error:", error);
    return c.json({ error: "更新用户失败" }, 500);
  }
});

app.delete("/:id", requireRole("admin", "teacher"), async (c) => {
  try {
    const currentUser = c.get("user");
    const targetUserId = Number.parseInt(c.req.param("id"), 10);

    if (!Number.isFinite(targetUserId)) {
      return c.json({ error: "用户编号无效" }, 400);
    }

    if (Number(currentUser.id) === targetUserId) {
      return c.json({ error: "不能删除当前登录账号" }, 400);
    }

    const targetUser = await c.env.DB.prepare(
      `
      SELECT id, username, role
      FROM users
      WHERE id = ?
    `,
    )
      .bind(targetUserId)
      .first();

    if (
      currentUser.role === "teacher" &&
      targetUser &&
      targetUser.role !== "student"
    ) {
      return c.json({ error: "教师只能删除学生账号" }, 403);
    }

    if (!targetUser) {
      return c.json({ error: "用户不存在" }, 404);
    }

    if (targetUser.role === "admin") {
      const adminCount = await countAdmins(c.env.DB);
      if (adminCount <= 1) {
        return c.json({ error: "系统至少需要保留一个管理员账号" }, 400);
      }
    }

    const blockers = await getUserDeleteBlockers(c.env.DB, targetUserId);
    if (blockers.length) {
      return c.json(
        {
          error: formatUserDeleteBlockersMessage(targetUser.username, blockers),
          dependencies: blockers,
        },
        409,
      );
    }

    await clearUserDeleteNullableReferences(c.env.DB, targetUserId);

    await c.env.DB.prepare(
      `
      DELETE FROM users
      WHERE id = ?
    `,
    )
      .bind(targetUserId)
      .run();

    try {
      await c.env.BUCKET.delete(buildAvatarObjectKey(targetUserId));
    } catch (bucketError) {
      console.error("Delete user avatar object error:", bucketError);
    }

    await recordAuditLog(c.env.DB, {
      ...getAuditContext(c),
      action: "user.delete",
      targetType: "user",
      targetId: targetUserId,
      summary: `删除了用户 ${targetUser.username}`,
    });

    return c.json({ message: "用户已删除" });
  } catch (error) {
    console.error("Delete user error:", error);
    const errorMessage = String(error?.message || "");
    if (errorMessage.includes("FOREIGN KEY constraint failed")) {
      return c.json(
        { error: "Cannot delete user because related records still exist." },
        409,
      );
    }

    if (
      errorMessage.includes("SQLITE_BUSY") ||
      errorMessage.includes("database is locked")
    ) {
      return c.json({ error: "Database is busy. Please try again." }, 503);
    }

    return c.json({ error: "删除用户失败" }, 500);
  }
});

export default app;
