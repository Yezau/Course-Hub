import { Hono } from "hono";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import { ensureAssignmentSchemaMigration } from "../db/init.js";
import { getAuditContext, recordAuditLog } from "../utils/audit.js";
import { ensureStorageQuotaForIncomingBytes } from "../utils/storage-quota.js";

const app = new Hono();

app.use("/*", authMiddleware);
app.use("/*", async (c, next) => {
  try {
    await ensureAssignmentSchemaMigration(c.env.DB);
  } catch (error) {
    console.error("Ensure assignment schema error:", error);
    return c.json({ error: "作业数据初始化失败" }, 500);
  }

  await next();
});

const MAX_ATTACHMENT_COUNT = 10;
const MAX_ATTACHMENT_SIZE = 50 * 1024 * 1024;
const UTC8_OFFSET_HOURS = 8;
const UTC8_OFFSET_MS = UTC8_OFFSET_HOURS * 60 * 60 * 1000;
const SQL_NOW_UTC8 = "datetime('now', '+8 hours')";
const LOCAL_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;
const TIMEZONE_SUFFIX_PATTERN = /(Z|[+-]\d{2}:?\d{2})$/i;

function getFilesTotalSize(files = []) {
  return (files || []).reduce((sum, file) => {
    return sum + toNumber(file?.size);
  }, 0);
}

function getAttachmentsTotalSize(attachments = []) {
  return (attachments || []).reduce((sum, attachment) => {
    return sum + toNumber(attachment?.size ?? attachment?.file_size);
  }, 0);
}

const assignmentListQuery = `
  WITH student_totals AS (
    SELECT COUNT(*) AS total_students
    FROM users
    WHERE role = 'student'
  ),
  submission_stats AS (
    SELECT
      s.assignment_id,
      COUNT(*) AS submission_count,
      SUM(CASE WHEN s.score IS NOT NULL OR s.status = 'graded' THEN 1 ELSE 0 END) AS graded_count,
      SUM(CASE WHEN s.score IS NULL AND s.status != 'graded' THEN 1 ELSE 0 END) AS pending_grade_count,
      ROUND(AVG(CASE WHEN s.score IS NOT NULL THEN s.score END), 1) AS avg_score,
      SUM(
        CASE
          WHEN a.due_date IS NOT NULL
            AND datetime(s.submitted_at) > datetime(a.due_date)
          THEN 1 ELSE 0
        END
      ) AS late_count
    FROM submissions s
    INNER JOIN assignments a ON a.id = s.assignment_id
    GROUP BY s.assignment_id
  )
  SELECT
    a.*,
    creator.real_name AS creator_name,
    closer.real_name AS closed_by_name,
    COALESCE(st.total_students, 0) AS student_count,
    COALESCE(ss.submission_count, 0) AS submission_count,
    COALESCE(ss.graded_count, 0) AS graded_count,
    COALESCE(ss.pending_grade_count, 0) AS pending_grade_count,
    COALESCE(ss.late_count, 0) AS late_count,
    ss.avg_score
  FROM assignments a
  LEFT JOIN users creator ON a.created_by = creator.id
  LEFT JOIN users closer ON a.closed_by = closer.id
  LEFT JOIN student_totals st ON 1 = 1
  LEFT JOIN submission_stats ss ON ss.assignment_id = a.id
`;

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function toBoolean(value) {
  return value === true || value === 1 || value === "1";
}

function formatUtc8DateTime(date) {
  const utc8Date = new Date(date.getTime() + UTC8_OFFSET_MS);
  const year = utc8Date.getUTCFullYear();
  const month = String(utc8Date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(utc8Date.getUTCDate()).padStart(2, "0");
  const hour = String(utc8Date.getUTCHours()).padStart(2, "0");
  const minute = String(utc8Date.getUTCMinutes()).padStart(2, "0");
  const second = String(utc8Date.getUTCSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function parseDate(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const normalized = trimmed.replace("T", " ");
  if (!TIMEZONE_SUFFIX_PATTERN.test(trimmed)) {
    const localMatch = normalized.match(LOCAL_DATE_TIME_PATTERN);
    if (localMatch) {
      const [
        ,
        year,
        month,
        day,
        hour = "00",
        minute = "00",
        second = "00",
      ] = localMatch;

      const parsed = new Date(
        Date.UTC(
          Number(year),
          Number(month) - 1,
          Number(day),
          Number(hour) - UTC8_OFFSET_HOURS,
          Number(minute),
          Number(second),
        ),
      );

      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeDateTimeInput(value) {
  if (!value) return null;

  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const parsed = parseDate(trimmed);
  if (!parsed) return null;

  return formatUtc8DateTime(parsed);
}

function validateAssignmentWindow(availableFrom, dueDate) {
  if (!availableFrom || !dueDate) return null;

  const startDate = parseDate(availableFrom);
  const endDate = parseDate(dueDate);
  if (!startDate || !endDate) return null;

  if (endDate.getTime() < startDate.getTime()) {
    return "作业截止时间不能早于开放时间";
  }

  return null;
}

function normalizeReminderHours(value) {
  if (value === undefined || value === null || value === "") {
    return 72;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return null;
  }

  const roundedValue = Math.round(numericValue);
  if (roundedValue < 1 || roundedValue > 720) {
    return null;
  }

  return roundedValue;
}

function formatAverageScore(value) {
  if (value === null || value === undefined) return null;

  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) return null;

  return Number(numericValue.toFixed(1));
}

function createAttachmentId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getFileNameFromKey(fileKey) {
  const normalized = String(fileKey || "");
  const segments = normalized.split("/");
  return segments[segments.length - 1] || normalized || "attachment";
}

function normalizeStoredAttachment(entry, index = 0) {
  if (!entry) return null;

  if (typeof entry === "string") {
    return {
      id: `legacy-${index}`,
      name: getFileNameFromKey(entry),
      key: entry,
      size: 0,
      type: "application/octet-stream",
      uploaded_at: null,
    };
  }

  const key = entry.key || entry.file_key;
  if (!key) return null;

  return {
    id: entry.id || `legacy-${index}`,
    name: entry.name || entry.file_name || getFileNameFromKey(key),
    key,
    size: toNumber(entry.size ?? entry.file_size),
    type: entry.type || entry.file_type || "application/octet-stream",
    uploaded_at: entry.uploaded_at || entry.created_at || null,
  };
}

function parseStoredAttachments(value) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return normalizeStoredAttachment(parsed)
        ? [normalizeStoredAttachment(parsed)]
        : [];
    }

    return parsed
      .map((entry, index) => normalizeStoredAttachment(entry, index))
      .filter(Boolean);
  } catch (error) {
    const legacyAttachment = normalizeStoredAttachment(value);
    return legacyAttachment ? [legacyAttachment] : [];
  }
}

function serializeStoredAttachments(attachments) {
  return JSON.stringify(
    (attachments || []).map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      key: attachment.key,
      size: toNumber(attachment.size),
      type: attachment.type || "application/octet-stream",
      uploaded_at: attachment.uploaded_at || null,
    })),
  );
}

function toAttachmentSummary(attachments) {
  return attachments.map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    size: toNumber(attachment.size),
    type: attachment.type || "application/octet-stream",
    uploaded_at: attachment.uploaded_at || null,
  }));
}

function buildAssignmentStats(record) {
  const totalStudents = toNumber(record.student_count);
  const submitted = toNumber(record.submission_count);
  const graded = toNumber(record.graded_count);
  const pendingGrade = toNumber(record.pending_grade_count);
  const late = toNumber(record.late_count);

  return {
    total_students: totalStudents,
    submitted,
    missing: Math.max(totalStudents - submitted, 0),
    graded,
    pending_grade: pendingGrade,
    late,
    average_score: formatAverageScore(record.avg_score),
  };
}

function enrichAssignment(record) {
  const stats = buildAssignmentStats(record);
  const attachments = parseStoredAttachments(record.attachment_key);

  return {
    ...record,
    total_score: toNumber(record.total_score, 100),
    reminder_hours: toNumber(record.reminder_hours, 72),
    is_closed: toBoolean(record.is_closed),
    student_count: stats.total_students,
    submission_count: stats.submitted,
    graded_count: stats.graded,
    pending_grade_count: stats.pending_grade,
    missing_count: stats.missing,
    late_submission_count: stats.late,
    avg_score: stats.average_score,
    attachments: toAttachmentSummary(attachments),
    attachment_count: attachments.length,
    stats,
  };
}

function enrichSubmission(record) {
  const attachments = parseStoredAttachments(record.file_keys);

  return {
    ...record,
    score:
      record.score === null || record.score === undefined
        ? null
        : Number(record.score),
    is_late: Boolean(toNumber(record.is_late)),
    content_length: toNumber(record.content_length),
    attachments: toAttachmentSummary(attachments),
    attachment_count: attachments.length,
  };
}

async function getAssignmentRecordById(db, assignmentId) {
  return db
    .prepare(
      `
    ${assignmentListQuery}
    WHERE a.id = ?
    LIMIT 1
  `,
    )
    .bind(assignmentId)
    .first();
}

async function getAssignmentStorageRecord(db, assignmentId) {
  return db
    .prepare(
      `
    SELECT
      id,
      title,
      description,
      available_from,
      due_date,
      total_score,
      reminder_hours,
      is_closed,
      closed_at,
      closed_by,
      attachment_key
    FROM assignments
    WHERE id = ?
    LIMIT 1
  `,
    )
    .bind(assignmentId)
    .first();
}

async function getSubmissionStorageRecordsByAssignmentId(db, assignmentId) {
  const result = await db
    .prepare(
      `
    SELECT
      id,
      student_id,
      file_keys
    FROM submissions
    WHERE assignment_id = ?
  `,
    )
    .bind(assignmentId)
    .all();

  return result.results || [];
}

async function getStudentSubmissionMap(db, studentId) {
  const { results } = await db
    .prepare(
      `
    SELECT
      s.id,
      s.assignment_id,
      s.status,
      s.score,
      s.feedback,
      s.content,
      s.file_keys,
      s.submitted_at,
      s.graded_at,
      CASE
        WHEN a.due_date IS NOT NULL
          AND datetime(s.submitted_at) > datetime(a.due_date)
        THEN 1 ELSE 0
      END AS is_late,
      LENGTH(TRIM(COALESCE(s.content, ''))) AS content_length
    FROM submissions s
    INNER JOIN assignments a ON a.id = s.assignment_id
    WHERE s.student_id = ?
  `,
    )
    .bind(studentId)
    .all();

  return new Map(
    (results || []).map((submission) => {
      return [submission.assignment_id, enrichSubmission(submission)];
    }),
  );
}

async function deleteStoredAttachments(bucket, attachments) {
  for (const attachment of attachments || []) {
    try {
      await bucket.delete(attachment.key);
    } catch (error) {
      console.error("Delete attachment from bucket error:", error);
    }
  }
}

async function uploadAttachments({
  bucket,
  files,
  prefix,
  env,
  db,
  storageBytesToFree = 0,
}) {
  const totalIncomingBytes = getFilesTotalSize(files);
  if (totalIncomingBytes > 0) {
    await ensureStorageQuotaForIncomingBytes(env, db, totalIncomingBytes, {
      bytesToFree: storageBytesToFree,
    });
  }

  const uploadedAttachments = [];

  for (const file of files) {
    if (!file || typeof file.name !== "string") {
      continue;
    }

    if (file.size > MAX_ATTACHMENT_SIZE) {
      throw new Error(`文件 ${file.name} 超过 50MB 限制`);
    }

    const attachmentId = createAttachmentId();
    const fileKey = `${prefix}/${attachmentId}-${file.name}`;

    await bucket.put(fileKey, file.stream(), {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
    });

    uploadedAttachments.push({
      id: attachmentId,
      name: file.name,
      key: fileKey,
      size: toNumber(file.size),
      type: file.type || "application/octet-stream",
      uploaded_at: formatUtc8DateTime(new Date()),
    });
  }

  return uploadedAttachments;
}

function getFormFiles(formData, fieldName = "files") {
  return formData
    .getAll(fieldName)
    .filter(
      (item) =>
        item && typeof item === "object" && typeof item.name === "string",
    );
}

async function parseSubmissionPayload(c) {
  const contentType = c.req.header("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await c.req.formData();
    return {
      content: `${formData.get("content") || ""}`.trim(),
      files: getFormFiles(formData),
    };
  }

  const payload = await c.req.json();
  return {
    content: `${payload?.content || ""}`.trim(),
    files: [],
  };
}

async function findSubmissionById(db, submissionId) {
  return db
    .prepare(
      `
    SELECT
      s.*,
      a.title AS assignment_title,
      a.total_score,
      a.due_date,
      u.real_name AS student_name,
      u.student_id
    FROM submissions s
    INNER JOIN assignments a ON a.id = s.assignment_id
    LEFT JOIN users u ON s.student_id = u.id
    WHERE s.id = ?
    LIMIT 1
  `,
    )
    .bind(submissionId)
    .first();
}

function getAttachmentById(attachments, attachmentId) {
  return (
    (attachments || []).find((attachment) => attachment.id === attachmentId) ||
    null
  );
}

function buildDownloadHeaders(fileName, fileType) {
  return {
    "Content-Type": fileType || "application/octet-stream",
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName || "attachment")}`,
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
    Vary: "Authorization",
  };
}

app.get("/", async (c) => {
  try {
    const user = c.get("user");

    const { results } = await c.env.DB.prepare(
      `
      ${assignmentListQuery}
      ORDER BY
        CASE WHEN a.is_closed = 1 THEN 1 ELSE 0 END,
        CASE WHEN a.due_date IS NULL THEN 1 ELSE 0 END,
        datetime(a.due_date) ASC,
        datetime(a.created_at) DESC
    `,
    ).all();

    const assignments = (results || []).map(enrichAssignment);

    if (user.role === "student" && assignments.length > 0) {
      const submissionMap = await getStudentSubmissionMap(c.env.DB, user.id);

      return c.json({
        assignments: assignments.map((assignment) => ({
          ...assignment,
          my_submission: submissionMap.get(assignment.id) || null,
        })),
      });
    }

    return c.json({ assignments });
  } catch (error) {
    console.error("Get assignments error:", error);
    return c.json({ error: "获取作业列表失败" }, 500);
  }
});

app.post("/", requireRole("teacher", "admin"), async (c) => {
  try {
    const payload = await c.req.json();
    const title = `${payload?.title || ""}`.trim();
    const description = `${payload?.description || ""}`.trim();
    const availableFrom = normalizeDateTimeInput(payload?.available_from);
    const dueDate = normalizeDateTimeInput(payload?.due_date);
    const reminderHours = normalizeReminderHours(payload?.reminder_hours);
    const totalScore =
      payload?.total_score === undefined || payload?.total_score === null
        ? 100
        : Number(payload.total_score);

    if (!title) {
      return c.json({ error: "请填写作业标题" }, 400);
    }

    if (!Number.isFinite(totalScore) || totalScore <= 0) {
      return c.json({ error: "总分必须大于 0" }, 400);
    }

    if (payload?.available_from && !availableFrom) {
      return c.json({ error: "开放时间格式不正确" }, 400);
    }

    if (payload?.due_date && !dueDate) {
      return c.json({ error: "截止时间格式不正确" }, 400);
    }

    if (reminderHours === null) {
      return c.json({ error: "临近截止提醒时长必须在 1 到 720 小时之间" }, 400);
    }

    const windowError = validateAssignmentWindow(availableFrom, dueDate);
    if (windowError) {
      return c.json({ error: windowError }, 400);
    }

    const user = c.get("user");
    const result = await c.env.DB.prepare(
      `
      INSERT INTO assignments (
        title,
        description,
        available_from,
        due_date,
        total_score,
        reminder_hours,
        created_by,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ${SQL_NOW_UTC8}, ${SQL_NOW_UTC8})
    `,
    )
      .bind(
        title,
        description,
        availableFrom,
        dueDate,
        Math.round(totalScore),
        reminderHours,
        user.id,
      )
      .run();

    const newAssignmentId = result.meta.last_row_id;
    try {
      await c.env.DB.prepare(
        `
        INSERT INTO notifications (user_id, type, source_id, actor_id, message, created_at)
        SELECT id, 'assignment_new', ?, ?, ?, ${SQL_NOW_UTC8}
        FROM users WHERE role = 'student'
      `,
      )
        .bind(
          newAssignmentId,
          user.id,
          `您有新发布的作业《${title}》，请及时查看`,
        )
        .run();
    } catch (err) {
      console.error("Failed to dispatch notifications", err);
    }

    return c.json(
      {
        message: "作业发布成功",
        assignment: { id: result.meta.last_row_id },
      },
      201,
    );
  } catch (error) {
    console.error("Create assignment error:", error);
    return c.json({ error: "作业发布失败" }, 500);
  }
});

app.patch("/:id", requireRole("teacher", "admin"), async (c) => {
  try {
    const assignmentId = c.req.param("id");
    const payload = await c.req.json();
    const assignment = await getAssignmentStorageRecord(c.env.DB, assignmentId);

    if (!assignment) {
      return c.json({ error: "作业不存在" }, 404);
    }

    const title =
      payload?.title === undefined
        ? assignment.title
        : `${payload.title || ""}`.trim();
    const description =
      payload?.description === undefined
        ? assignment.description || ""
        : `${payload.description || ""}`.trim();
    const availableFrom =
      payload?.available_from === undefined
        ? assignment.available_from
        : normalizeDateTimeInput(payload.available_from);
    const dueDate =
      payload?.due_date === undefined
        ? assignment.due_date
        : normalizeDateTimeInput(payload.due_date);
    const reminderHours =
      payload?.reminder_hours === undefined
        ? toNumber(assignment.reminder_hours, 72)
        : normalizeReminderHours(payload.reminder_hours);
    const totalScore =
      payload?.total_score === undefined
        ? toNumber(assignment.total_score, 100)
        : Number(payload.total_score);

    if (!title) {
      return c.json({ error: "请填写作业标题" }, 400);
    }

    if (
      payload?.available_from !== undefined &&
      payload?.available_from &&
      !availableFrom
    ) {
      return c.json({ error: "开放时间格式不正确" }, 400);
    }

    if (payload?.due_date !== undefined && payload?.due_date && !dueDate) {
      return c.json({ error: "截止时间格式不正确" }, 400);
    }

    if (!Number.isFinite(totalScore) || totalScore <= 0) {
      return c.json({ error: "总分必须大于 0" }, 400);
    }

    if (reminderHours === null) {
      return c.json({ error: "临近截止提醒时长必须在 1 到 720 小时之间" }, 400);
    }

    const windowError = validateAssignmentWindow(availableFrom, dueDate);
    if (windowError) {
      return c.json({ error: windowError }, 400);
    }

    await c.env.DB.prepare(
      `
      UPDATE assignments
      SET
        title = ?,
        description = ?,
        available_from = ?,
        due_date = ?,
        total_score = ?,
        reminder_hours = ?,
        updated_at = ${SQL_NOW_UTC8}
      WHERE id = ?
    `,
    )
      .bind(
        title,
        description,
        availableFrom,
        dueDate,
        Math.round(totalScore),
        reminderHours,
        assignmentId,
      )
      .run();

    const updatedRecord = await getAssignmentRecordById(c.env.DB, assignmentId);

    return c.json({
      message: "作业已更新",
      assignment: enrichAssignment(updatedRecord),
    });
  } catch (error) {
    console.error("Update assignment error:", error);
    return c.json({ error: "作业更新失败" }, 500);
  }
});

app.delete("/:id", requireRole("admin"), async (c) => {
  try {
    const assignmentId = c.req.param("id");
    const assignment = await getAssignmentStorageRecord(c.env.DB, assignmentId);

    if (!assignment) {
      return c.json({ error: "作业不存在" }, 404);
    }

    const submissions = await getSubmissionStorageRecordsByAssignmentId(
      c.env.DB,
      assignmentId,
    );
    const assignmentAttachments = parseStoredAttachments(
      assignment.attachment_key,
    );
    const submissionAttachments = submissions.flatMap((submission) =>
      parseStoredAttachments(submission.file_keys),
    );

    await c.env.DB.prepare(
      `
      DELETE FROM submissions
      WHERE assignment_id = ?
    `,
    )
      .bind(assignmentId)
      .run();

    await c.env.DB.prepare(
      `
      DELETE FROM assignments
      WHERE id = ?
    `,
    )
      .bind(assignmentId)
      .run();

    await deleteStoredAttachments(c.env.BUCKET, [
      ...assignmentAttachments,
      ...submissionAttachments,
    ]);

    await recordAuditLog(c.env.DB, {
      ...getAuditContext(c),
      action: "assignment.delete",
      targetType: "assignment",
      targetId: Number(assignmentId),
      summary: `删除作业 ${assignment.title}`,
      details: {
        submission_count: submissions.length,
        attachment_count: assignmentAttachments.length,
        submission_attachment_count: submissionAttachments.length,
      },
    });

    return c.json({ message: "作业已删除" });
  } catch (error) {
    console.error("Delete assignment error:", error);
    return c.json({ error: "删除作业失败" }, 500);
  }
});

app.post("/:id/close", requireRole("teacher", "admin"), async (c) => {
  try {
    const assignmentId = c.req.param("id");
    const user = c.get("user");
    const assignment = await getAssignmentStorageRecord(c.env.DB, assignmentId);

    if (!assignment) {
      return c.json({ error: "作业不存在" }, 404);
    }

    await c.env.DB.prepare(
      `
      UPDATE assignments
      SET
        is_closed = 1,
        closed_at = ${SQL_NOW_UTC8},
        closed_by = ?,
        updated_at = ${SQL_NOW_UTC8}
      WHERE id = ?
    `,
    )
      .bind(user.id, assignmentId)
      .run();

    return c.json({ message: "作业已关闭" });
  } catch (error) {
    console.error("Close assignment error:", error);
    return c.json({ error: "关闭作业失败" }, 500);
  }
});

app.post("/:id/reopen", requireRole("teacher", "admin"), async (c) => {
  try {
    const assignmentId = c.req.param("id");
    const assignment = await getAssignmentStorageRecord(c.env.DB, assignmentId);

    if (!assignment) {
      return c.json({ error: "作业不存在" }, 404);
    }

    await c.env.DB.prepare(
      `
      UPDATE assignments
      SET
        is_closed = 0,
        closed_at = NULL,
        closed_by = NULL,
        updated_at = ${SQL_NOW_UTC8}
      WHERE id = ?
    `,
    )
      .bind(assignmentId)
      .run();

    return c.json({ message: "作业已重新开放" });
  } catch (error) {
    console.error("Reopen assignment error:", error);
    return c.json({ error: "重新开放作业失败" }, 500);
  }
});

app.post("/:id/attachments", requireRole("teacher", "admin"), async (c) => {
  try {
    const assignmentId = c.req.param("id");
    const assignment = await getAssignmentStorageRecord(c.env.DB, assignmentId);

    if (!assignment) {
      return c.json({ error: "作业不存在" }, 404);
    }

    const formData = await c.req.formData();
    const files = getFormFiles(formData);

    if (!files.length) {
      return c.json({ error: "请选择要上传的附件" }, 400);
    }

    const existingAttachments = parseStoredAttachments(
      assignment.attachment_key,
    );
    if (existingAttachments.length + files.length > MAX_ATTACHMENT_COUNT) {
      return c.json(
        { error: `单个作业最多上传 ${MAX_ATTACHMENT_COUNT} 个附件` },
        400,
      );
    }

    const uploadedAttachments = await uploadAttachments({
      bucket: c.env.BUCKET,
      files,
      prefix: `assignments/${assignmentId}/attachments`,
      env: c.env,
      db: c.env.DB,
    });

    const mergedAttachments = [...existingAttachments, ...uploadedAttachments];

    await c.env.DB.prepare(
      `
      UPDATE assignments
      SET attachment_key = ?, updated_at = ${SQL_NOW_UTC8}
      WHERE id = ?
    `,
    )
      .bind(serializeStoredAttachments(mergedAttachments), assignmentId)
      .run();

    return c.json({
      message: "作业附件上传成功",
      attachments: toAttachmentSummary(mergedAttachments),
    });
  } catch (error) {
    console.error("Upload assignment attachments error:", error);
    const status = Number.isInteger(error?.status) ? error.status : 500;
    return c.json({ error: error.message || "作业附件上传失败" }, status);
  }
});

app.delete(
  "/:id/attachments/:attachmentId",
  requireRole("teacher", "admin"),
  async (c) => {
    try {
      const assignmentId = c.req.param("id");
      const attachmentId = c.req.param("attachmentId");
      const assignment = await getAssignmentStorageRecord(
        c.env.DB,
        assignmentId,
      );

      if (!assignment) {
        return c.json({ error: "作业不存在" }, 404);
      }

      const attachments = parseStoredAttachments(assignment.attachment_key);
      const targetAttachment = getAttachmentById(attachments, attachmentId);

      if (!targetAttachment) {
        return c.json({ error: "附件不存在" }, 404);
      }

      await deleteStoredAttachments(c.env.BUCKET, [targetAttachment]);

      const nextAttachments = attachments.filter(
        (attachment) => attachment.id !== attachmentId,
      );
      await c.env.DB.prepare(
        `
      UPDATE assignments
      SET attachment_key = ?, updated_at = ${SQL_NOW_UTC8}
      WHERE id = ?
    `,
      )
        .bind(serializeStoredAttachments(nextAttachments), assignmentId)
        .run();

      return c.json({
        message: "附件已删除",
        attachments: toAttachmentSummary(nextAttachments),
      });
    } catch (error) {
      console.error("Delete assignment attachment error:", error);
      return c.json({ error: "删除作业附件失败" }, 500);
    }
  },
);

app.get("/:id/attachments/:attachmentId/download", async (c) => {
  try {
    const assignmentId = c.req.param("id");
    const attachmentId = c.req.param("attachmentId");
    const assignment = await getAssignmentStorageRecord(c.env.DB, assignmentId);

    if (!assignment) {
      return c.json({ error: "作业不存在" }, 404);
    }

    const attachments = parseStoredAttachments(assignment.attachment_key);
    const targetAttachment = getAttachmentById(attachments, attachmentId);

    if (!targetAttachment) {
      return c.json({ error: "附件不存在" }, 404);
    }

    const object = await c.env.BUCKET.get(targetAttachment.key);
    if (!object) {
      return c.json({ error: "附件文件不存在" }, 404);
    }

    return new Response(object.body, {
      headers: buildDownloadHeaders(
        targetAttachment.name,
        targetAttachment.type,
      ),
    });
  } catch (error) {
    console.error("Download assignment attachment error:", error);
    return c.json({ error: "获取附件失败" }, 500);
  }
});

app.get(
  "/submissions/:submissionId/attachments/:attachmentId/download",
  async (c) => {
    try {
      const submissionId = c.req.param("submissionId");
      const attachmentId = c.req.param("attachmentId");
      const user = c.get("user");
      const submission = await findSubmissionById(c.env.DB, submissionId);

      if (!submission) {
        return c.json({ error: "提交记录不存在" }, 404);
      }

      if (
        user.role === "student" &&
        Number(user.id) !== Number(submission.student_id)
      ) {
        return c.json({ error: "无权访问该附件" }, 403);
      }

      const attachments = parseStoredAttachments(submission.file_keys);
      const targetAttachment = getAttachmentById(attachments, attachmentId);

      if (!targetAttachment) {
        return c.json({ error: "附件不存在" }, 404);
      }

      const object = await c.env.BUCKET.get(targetAttachment.key);
      if (!object) {
        return c.json({ error: "附件文件不存在" }, 404);
      }

      return new Response(object.body, {
        headers: buildDownloadHeaders(
          targetAttachment.name,
          targetAttachment.type,
        ),
      });
    } catch (error) {
      console.error("Download submission attachment error:", error);
      return c.json({ error: "获取附件失败" }, 500);
    }
  },
);

app.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const user = c.get("user");

    const record = await getAssignmentRecordById(c.env.DB, id);

    if (!record) {
      return c.json({ error: "作业不存在" }, 404);
    }

    const assignment = enrichAssignment(record);

    if (user.role === "student") {
      const submission = await c.env.DB.prepare(
        `
        SELECT
          s.*,
          CASE
            WHEN a.due_date IS NOT NULL
              AND datetime(s.submitted_at) > datetime(a.due_date)
            THEN 1 ELSE 0
          END AS is_late,
          LENGTH(TRIM(COALESCE(s.content, ''))) AS content_length
        FROM submissions s
        INNER JOIN assignments a ON a.id = s.assignment_id
        WHERE s.assignment_id = ? AND s.student_id = ?
        LIMIT 1
      `,
      )
        .bind(id, user.id)
        .first();

      assignment.my_submission = submission
        ? enrichSubmission(submission)
        : null;
    }

    return c.json({ assignment });
  } catch (error) {
    console.error("Get assignment error:", error);
    return c.json({ error: "获取作业详情失败" }, 500);
  }
});

app.post("/:id/submit", requireRole("student"), async (c) => {
  try {
    const assignmentId = c.req.param("id");
    const { content, files } = await parseSubmissionPayload(c);
    const user = c.get("user");

    if (!content) {
      return c.json({ error: "提交内容不能为空" }, 400);
    }

    const assignment = await getAssignmentStorageRecord(c.env.DB, assignmentId);
    if (!assignment) {
      return c.json({ error: "作业不存在" }, 404);
    }

    if (toBoolean(assignment.is_closed)) {
      return c.json({ error: "该作业已被教师关闭，暂不能继续提交" }, 400);
    }

    const availableFrom = parseDate(assignment.available_from);
    if (availableFrom && Date.now() < availableFrom.getTime()) {
      return c.json({ error: "该作业尚未开放提交" }, 400);
    }

    if (files.length > MAX_ATTACHMENT_COUNT) {
      return c.json(
        { error: `单次提交最多上传 ${MAX_ATTACHMENT_COUNT} 个附件` },
        400,
      );
    }

    const dueDate = parseDate(assignment.due_date);
    const isLate = dueDate ? Date.now() > dueDate.getTime() : false;

    const existingSubmission = await c.env.DB.prepare(
      `
      SELECT id, file_keys
      FROM submissions
      WHERE assignment_id = ? AND student_id = ?
      LIMIT 1
    `,
    )
      .bind(assignmentId, user.id)
      .first();

    let nextAttachments = existingSubmission
      ? parseStoredAttachments(existingSubmission.file_keys)
      : [];

    if (files.length > 0) {
      if (files.length > MAX_ATTACHMENT_COUNT) {
        return c.json(
          { error: `单次提交最多上传 ${MAX_ATTACHMENT_COUNT} 个附件` },
          400,
        );
      }

      const replacedAttachmentBytes = getAttachmentsTotalSize(nextAttachments);

      if (nextAttachments.length > 0) {
        await deleteStoredAttachments(c.env.BUCKET, nextAttachments);
      }

      nextAttachments = await uploadAttachments({
        bucket: c.env.BUCKET,
        files,
        prefix: `assignments/${assignmentId}/submissions/${user.id}`,
        env: c.env,
        db: c.env.DB,
        storageBytesToFree: replacedAttachmentBytes,
      });
    }

    if (existingSubmission) {
      await c.env.DB.prepare(
        `
        UPDATE submissions
        SET
          content = ?,
          file_keys = ?,
          status = 'submitted',
          score = NULL,
          feedback = NULL,
          graded_at = NULL,
          graded_by = NULL,
          submitted_at = ${SQL_NOW_UTC8}
        WHERE assignment_id = ? AND student_id = ?
      `,
      )
        .bind(
          content,
          serializeStoredAttachments(nextAttachments),
          assignmentId,
          user.id,
        )
        .run();
    } else {
      await c.env.DB.prepare(
        `
        INSERT INTO submissions (assignment_id, student_id, content, file_keys, status, submitted_at)
        VALUES (?, ?, ?, ?, 'submitted', ${SQL_NOW_UTC8})
      `,
      )
        .bind(
          assignmentId,
          user.id,
          content,
          serializeStoredAttachments(nextAttachments),
        )
        .run();
    }

    return c.json({
      message: isLate ? "作业已提交，系统已标记为逾期提交" : "作业提交成功",
      submission: {
        is_late: isLate,
        attachment_count: nextAttachments.length,
      },
    });
  } catch (error) {
    console.error("Submit assignment error:", error);
    const status = Number.isInteger(error?.status) ? error.status : 500;
    return c.json({ error: error.message || "作业提交失败" }, status);
  }
});

app.get("/:id/submissions", requireRole("teacher", "admin"), async (c) => {
  try {
    const assignmentId = c.req.param("id");
    const assignment = await getAssignmentStorageRecord(c.env.DB, assignmentId);

    if (!assignment) {
      return c.json({ error: "作业不存在" }, 404);
    }

    const { results } = await c.env.DB.prepare(
      `
      SELECT
        s.*,
        u.real_name AS student_name,
        u.student_id,
        CASE
          WHEN a.due_date IS NOT NULL
            AND datetime(s.submitted_at) > datetime(a.due_date)
          THEN 1 ELSE 0
        END AS is_late,
        LENGTH(TRIM(COALESCE(s.content, ''))) AS content_length
      FROM submissions s
      INNER JOIN assignments a ON a.id = s.assignment_id
      LEFT JOIN users u ON s.student_id = u.id
      WHERE s.assignment_id = ?
      ORDER BY
        CASE WHEN s.score IS NULL AND s.status != 'graded' THEN 0 ELSE 1 END,
        datetime(s.submitted_at) DESC
    `,
    )
      .bind(assignmentId)
      .all();

    return c.json({
      submissions: (results || []).map(enrichSubmission),
    });
  } catch (error) {
    console.error("Get submissions error:", error);
    return c.json({ error: "获取提交列表失败" }, 500);
  }
});

app.put(
  "/submissions/:id/grade",
  requireRole("teacher", "admin"),
  async (c) => {
    try {
      const submissionId = c.req.param("id");
      const payload = await c.req.json();
      const score = Number(payload?.score);
      const feedback = `${payload?.feedback || ""}`.trim() || null;
      const user = c.get("user");

      if (!Number.isFinite(score)) {
        return c.json({ error: "请填写有效分数" }, 400);
      }

      const submission = await findSubmissionById(c.env.DB, submissionId);
      if (!submission) {
        return c.json({ error: "提交记录不存在" }, 404);
      }

      const maxScore = toNumber(submission.total_score, 100);
      if (score < 0 || score > maxScore) {
        return c.json({ error: `分数必须在 0 到 ${maxScore} 之间` }, 400);
      }

      await c.env.DB.prepare(
        `
      UPDATE submissions
      SET
        score = ?,
        feedback = ?,
        status = 'graded',
        graded_at = ${SQL_NOW_UTC8},
        graded_by = ?
      WHERE id = ?
    `,
      )
        .bind(score, feedback, user.id, submissionId)
        .run();

      return c.json({ message: "评分已保存" });
    } catch (error) {
      console.error("Grade submission error:", error);
      return c.json({ error: "评分保存失败" }, 500);
    }
  },
);

export default app;
