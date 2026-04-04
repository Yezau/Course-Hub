import { Hono } from "hono";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import { ensureStorageQuotaForIncomingBytes } from "../utils/storage-quota.js";

const MENTION_BOUNDARY_PATTERN = /[\s([{"'“‘,，。！？!?:;；、]/;
const MENTION_TRAILING_PUNCTUATION_PATTERN =
  /[.,!?;:，。！？；：、)\]}>"'”’]+$/g;

function extractMentionUsernames(text = "") {
  const source = String(text || "");
  const mentionRegex = /@([^\s<>@]+)/g;
  const usernames = new Set();

  for (const match of source.matchAll(mentionRegex)) {
    const mentionIndex = match.index ?? -1;
    if (mentionIndex < 0) {
      continue;
    }

    const previousChar = mentionIndex === 0 ? "" : source[mentionIndex - 1];
    if (mentionIndex > 0 && !MENTION_BOUNDARY_PATTERN.test(previousChar)) {
      continue;
    }

    const normalizedUsername = String(match[1] || "")
      .replace(MENTION_TRAILING_PUNCTUATION_PATTERN, "")
      .trim();

    if (!normalizedUsername) {
      continue;
    }

    if (normalizedUsername.length < 3 || normalizedUsername.length > 32) {
      continue;
    }

    usernames.add(normalizedUsername);
  }

  return [...usernames];
}

async function parseAndNotifyMentions(
  db,
  text,
  sourceId,
  actorId,
  actorName,
  type,
) {
  if (!text) return;
  const usernames = extractMentionUsernames(text);
  if (usernames.length > 0) {
    try {
      const placeholders = usernames.map(() => "?").join(",");
      const usersResponse = await db
        .prepare(
          `SELECT id, username FROM users WHERE username IN (${placeholders})`,
        )
        .bind(...usernames)
        .all();
      const users = usersResponse.results || [];
      if (users.length > 0) {
        const batch = users.map((u) =>
          db
            .prepare(
              "INSERT INTO notifications (user_id, type, source_id, actor_id, message) VALUES (?, ?, ?, ?, ?)",
            )
            .bind(u.id, type, sourceId, actorId, `${actorName} 提到了您`),
        );
        await db.batch(batch);
      }
    } catch (e) {
      console.error("Mention notify error:", e);
    }
  }
}

const app = new Hono();

const MAX_POST_IMAGE_COUNT = 9;
const MAX_POST_IMAGE_SIZE = 8 * 1024 * 1024;
const MAX_POST_VIDEO_COUNT = 1;
const MAX_POST_VIDEO_SIZE = 100 * 1024 * 1024;
const ALLOWED_POST_TYPES = new Set(["moment", "article"]);

const postBaseSelect = `
  SELECT p.*, COALESCE(u.real_name, u.username) AS author_name
  FROM posts p
  LEFT JOIN users u ON p.author_id = u.id
`;

app.use("/*", authMiddleware);

const isFileLike = (value) => {
  return (
    value &&
    typeof value.name === "string" &&
    typeof value.type === "string" &&
    typeof value.stream === "function"
  );
};

const normalizeNumber = (value, fallback = null) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const getFilesTotalSize = (files = []) => {
  return (files || []).reduce((sum, file) => {
    const fileSize = Number(file?.size || 0);
    return Number.isFinite(fileSize) ? sum + Math.max(fileSize, 0) : sum;
  }, 0);
};

const getStoredMediaTotalSize = (mediaRecords = []) => {
  return (mediaRecords || []).reduce((sum, media) => {
    const mediaSize = Number(media?.file_size || 0);
    return Number.isFinite(mediaSize) ? sum + Math.max(mediaSize, 0) : sum;
  }, 0);
};

const getPostMediaKind = (contentType = "") => {
  const normalizedType = String(contentType || "").toLowerCase();

  if (normalizedType.startsWith("image/")) {
    return "image";
  }

  if (normalizedType.startsWith("video/")) {
    return "video";
  }

  return "unknown";
};

const summarizeMediaKindCounts = (mediaList = []) => {
  let imageCount = 0;
  let videoCount = 0;

  for (const media of mediaList || []) {
    const kind = getPostMediaKind(media?.file_type || media?.type || "");
    if (kind === "image") {
      imageCount += 1;
      continue;
    }

    if (kind === "video") {
      videoCount += 1;
    }
  }

  return { imageCount, videoCount };
};

const normalizePostType = (value, fallback = "article") => {
  return ALLOWED_POST_TYPES.has(value) ? value : fallback;
};

const stripMarkdown = (value = "") => {
  return String(value)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, " ")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/[*_~`>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const sanitizeFileName = (value = "image") => {
  const trimmed = String(value).trim();
  if (!trimmed) return "image";
  return trimmed.replace(/[^\w.-]/g, "_");
};

const generatePostFileKey = (postId, fileName) => {
  const suffix = Math.random().toString(36).slice(2, 10);
  return `posts/${postId}/${Date.now()}-${suffix}-${sanitizeFileName(fileName)}`;
};

const getPostMediaUrl = (mediaId) => `/api/posts/media/${mediaId}/file`;

const buildPostTitle = ({ postType, title, content }) => {
  const normalizedTitle = String(title || "").trim();
  if (normalizedTitle) return normalizedTitle;

  if (postType === "moment") {
    return "";
  }

  const snippet = stripMarkdown(content).slice(0, 36);
  return snippet || "未命名长文";
};

const parseIdArray = (value) => {
  if (value === undefined) return null;
  if (value === null || value === "") return [];

  const rawValue =
    typeof value === "string"
      ? (() => {
          try {
            return JSON.parse(value);
          } catch (error) {
            return [];
          }
        })()
      : value;

  if (!Array.isArray(rawValue)) {
    return [];
  }

  return rawValue
    .map((item) => normalizeNumber(item))
    .filter((item) => item !== null);
};

async function parsePostRequest(c) {
  const contentType = c.req.header("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await c.req.formData();
    const payloadText = String(formData.get("payload") || "{}");
    let payload = {};

    try {
      payload = JSON.parse(payloadText);
    } catch (error) {
      return { error: "帖子数据格式错误" };
    }

    const mediaFiles = formData.getAll("media").filter(isFileLike);

    return {
      payload,
      files: mediaFiles.length
        ? mediaFiles
        : formData.getAll("images").filter(isFileLike),
    };
  }

  return {
    payload: await c.req.json(),
    files: [],
  };
}

function validatePostFiles(files, existingMedia = []) {
  const existingCounts = summarizeMediaKindCounts(existingMedia);
  let newImageCount = 0;
  let newVideoCount = 0;

  for (const file of files) {
    const mediaKind = getPostMediaKind(file?.type || "");

    if (mediaKind === "unknown") {
      return "仅支持上传图片或视频文件";
    }

    if (mediaKind === "image") {
      newImageCount += 1;
      if (file.size > MAX_POST_IMAGE_SIZE) {
        return "单张图片不能超过 8 MB";
      }
      continue;
    }

    newVideoCount += 1;
    if (file.size > MAX_POST_VIDEO_SIZE) {
      return "单个视频不能超过 100 MB";
    }
  }

  const totalImageCount = existingCounts.imageCount + newImageCount;
  const totalVideoCount = existingCounts.videoCount + newVideoCount;

  if (totalImageCount > 0 && totalVideoCount > 0) {
    return "图片和视频不能混合上传";
  }

  if (totalImageCount > MAX_POST_IMAGE_COUNT) {
    return `最多只能上传 ${MAX_POST_IMAGE_COUNT} 张图片`;
  }

  if (totalVideoCount > MAX_POST_VIDEO_COUNT) {
    return "最多只能上传 1 个视频";
  }

  return "";
}

function normalizeCreatePayload(payload, files) {
  const postType = normalizePostType(payload?.post_type, "moment");
  const title = buildPostTitle({
    postType,
    title: payload?.title,
    content: payload?.content,
  });
  const summary =
    postType === "article" ? String(payload?.summary || "").trim() : "";
  const content = String(payload?.content || "").trim();
  const coverMediaId = normalizeNumber(payload?.cover_media_id);
  const coverNewIndex = normalizeNumber(payload?.cover_new_index);

  if (postType === "article" && !title) {
    return { error: "长文帖子需要填写标题" };
  }

  if (!content && !files.length) {
    return { error: "帖子内容和图片不能同时为空" };
  }

  const fileError = validatePostFiles(files, []);
  if (fileError) {
    return { error: fileError };
  }

  return {
    postType,
    title,
    summary,
    content,
    coverMediaId,
    coverNewIndex,
  };
}

function normalizeUpdatePayload(existingPost, payload, files, existingMedia) {
  const postType = normalizePostType(
    payload?.post_type,
    existingPost.post_type || "article",
  );
  const title = buildPostTitle({
    postType,
    title: payload?.title !== undefined ? payload.title : existingPost.title,
    content:
      payload?.content !== undefined ? payload.content : existingPost.content,
  });
  const summary =
    postType === "article"
      ? String(
          payload?.summary !== undefined
            ? payload.summary
            : existingPost.summary || "",
        ).trim()
      : "";
  const content = String(
    payload?.content !== undefined
      ? payload.content
      : existingPost.content || "",
  ).trim();
  const requestedRetainedIds = parseIdArray(payload?.retained_media_ids);
  const existingMediaIdSet = new Set(
    existingMedia.map((item) => Number(item.id)),
  );
  const retainedMediaIds =
    requestedRetainedIds === null
      ? existingMedia.map((item) => Number(item.id))
      : requestedRetainedIds.filter((item) => existingMediaIdSet.has(item));
  const coverMediaId = normalizeNumber(payload?.cover_media_id);
  const coverNewIndex = normalizeNumber(payload?.cover_new_index);

  if (postType === "article" && !title) {
    return { error: "长文帖子需要填写标题" };
  }

  if (!content && retainedMediaIds.length === 0 && !files.length) {
    return { error: "帖子内容和图片不能同时为空" };
  }

  const retainedMedia = existingMedia.filter((item) =>
    retainedMediaIds.includes(Number(item.id)),
  );
  const fileError = validatePostFiles(files, retainedMedia);
  if (fileError) {
    return { error: fileError };
  }

  return {
    postType,
    title,
    summary,
    content,
    retainedMediaIds,
    coverMediaId,
    coverNewIndex,
  };
}

function resolveCoverSelection({
  postType,
  retainedMedia,
  coverMediaId,
  coverNewIndex,
  newFiles,
}) {
  const retainedImageMedia = retainedMedia.filter(
    (item) => getPostMediaKind(item?.file_type || "") === "image",
  );

  if (postType !== "article") {
    return { coverMediaId: null, coverNewIndex: null };
  }

  if (
    coverMediaId !== null &&
    retainedImageMedia.some((item) => Number(item.id) === coverMediaId)
  ) {
    return { coverMediaId, coverNewIndex: null };
  }

  if (
    coverNewIndex !== null &&
    coverNewIndex >= 0 &&
    coverNewIndex < newFiles.length &&
    getPostMediaKind(newFiles[coverNewIndex]?.type || "") === "image"
  ) {
    return { coverMediaId: null, coverNewIndex };
  }

  if (retainedImageMedia.length > 0) {
    return {
      coverMediaId: Number(retainedImageMedia[0].id),
      coverNewIndex: null,
    };
  }

  const firstNewImageIndex = newFiles.findIndex(
    (file) => getPostMediaKind(file?.type || "") === "image",
  );
  if (firstNewImageIndex >= 0) {
    return { coverMediaId: null, coverNewIndex: firstNewImageIndex };
  }

  return { coverMediaId: null, coverNewIndex: null };
}

async function fetchPostById(db, postId) {
  return db
    .prepare(
      `
    ${postBaseSelect}
    WHERE p.id = ?
  `,
    )
    .bind(postId)
    .first();
}

async function getPostMediaRecords(db, postId) {
  const { results } = await db
    .prepare(
      `
    SELECT id, post_id, file_name, file_key, file_size, file_type, usage, sort_order, created_at
    FROM post_media
    WHERE post_id = ?
    ORDER BY CASE WHEN usage = 'cover' THEN 0 ELSE 1 END, sort_order ASC, id ASC
  `,
    )
    .bind(postId)
    .all();

  return results || [];
}

async function getPostReplies(db, postId) {
  const { results } = await db
    .prepare(
      `
    SELECT
      r.*,
      COALESCE(u.real_name, u.username) AS author_name,
      parent.author_id AS parent_author_id,
      COALESCE(pu.real_name, pu.username) AS parent_author_name
    FROM replies r
    LEFT JOIN users u ON r.author_id = u.id
    LEFT JOIN replies parent ON r.parent_id = parent.id
    LEFT JOIN users pu ON parent.author_id = pu.id
    WHERE r.post_id = ?
    ORDER BY datetime(r.created_at) ASC, r.id ASC
  `,
    )
    .bind(postId)
    .all();

  return results || [];
}

async function getReplyById(db, replyId) {
  return db
    .prepare(
      `
    SELECT
      r.*,
      COALESCE(u.real_name, u.username) AS author_name,
      parent.author_id AS parent_author_id,
      COALESCE(pu.real_name, pu.username) AS parent_author_name
    FROM replies r
    LEFT JOIN users u ON r.author_id = u.id
    LEFT JOIN replies parent ON r.parent_id = parent.id
    LEFT JOIN users pu ON parent.author_id = pu.id
    WHERE r.id = ?
  `,
    )
    .bind(replyId)
    .first();
}

async function attachMediaToPosts(c, posts) {
  if (!posts.length) return [];

  const placeholders = posts.map(() => "?").join(", ");
  const postIds = posts.map((post) => Number(post.id));

  const { results } = await c.env.DB.prepare(
    `
    SELECT id, post_id, file_name, file_key, file_size, file_type, usage, sort_order, created_at
    FROM post_media
    WHERE post_id IN (${placeholders})
    ORDER BY CASE WHEN usage = 'cover' THEN 0 ELSE 1 END, sort_order ASC, id ASC
  `,
  )
    .bind(...postIds)
    .all();

  const mediaMap = new Map();

  for (const media of results || []) {
    const postMedia = {
      ...media,
      is_cover: media.usage === "cover",
      url: getPostMediaUrl(media.id),
    };

    if (!mediaMap.has(media.post_id)) {
      mediaMap.set(media.post_id, []);
    }

    mediaMap.get(media.post_id).push(postMedia);
  }

  return posts.map((post) => {
    const media = mediaMap.get(post.id) || [];
    return {
      ...post,
      media,
      media_count: media.length,
      cover_media:
        media.find((item) => item.usage === "cover") || media[0] || null,
    };
  });
}

async function enrichPost(c, post) {
  if (!post) return null;
  const [enrichedPost] = await attachMediaToPosts(c, [post]);
  return enrichedPost || null;
}

async function deleteMediaObjects(bucket, mediaRecords) {
  for (const media of mediaRecords) {
    try {
      await bucket.delete(media.file_key);
    } catch (error) {
      console.error("Delete post media from R2 error:", error);
    }
  }
}

async function uploadPostMediaFiles(
  c,
  {
    postId,
    files,
    postType,
    coverNewIndex,
    startSortOrder,
    storageBytesToFree = 0,
  },
) {
  const uploadedMedia = [];

  const totalIncomingBytes = getFilesTotalSize(files);
  if (totalIncomingBytes > 0) {
    await ensureStorageQuotaForIncomingBytes(
      c.env,
      c.env.DB,
      totalIncomingBytes,
      {
        bytesToFree: storageBytesToFree,
      },
    );
  }

  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const fileKey = generatePostFileKey(postId, file.name);
      const fileKind = getPostMediaKind(file?.type || "");
      const usage =
        postType === "article" &&
        fileKind === "image" &&
        coverNewIndex === index
          ? "cover"
          : "gallery";

      await c.env.BUCKET.put(fileKey, file.stream(), {
        httpMetadata: { contentType: file.type },
      });

      const result = await c.env.DB.prepare(
        `
        INSERT INTO post_media (post_id, file_name, file_key, file_size, file_type, usage, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      )
        .bind(
          postId,
          file.name,
          fileKey,
          file.size,
          file.type,
          usage,
          startSortOrder + index,
        )
        .run();

      uploadedMedia.push({
        id: result.meta.last_row_id,
        file_key: fileKey,
      });
    }
  } catch (error) {
    await deleteMediaObjects(c.env.BUCKET, uploadedMedia);
    await Promise.all(
      uploadedMedia.map((media) =>
        c.env.DB.prepare("DELETE FROM post_media WHERE id = ?")
          .bind(media.id)
          .run(),
      ),
    );
    throw error;
  }
}

async function updateRetainedMediaUsage(
  db,
  retainedMedia,
  postType,
  coverMediaId,
) {
  for (const media of retainedMedia) {
    const usage =
      postType === "article" && Number(media.id) === coverMediaId
        ? "cover"
        : "gallery";

    await db
      .prepare("UPDATE post_media SET usage = ? WHERE id = ?")
      .bind(usage, media.id)
      .run();
  }
}

app.get("/media/:mediaId/file", async (c) => {
  try {
    const mediaId = c.req.param("mediaId");

    const media = await c.env.DB.prepare(
      `
      SELECT id, file_key, file_type, file_name
      FROM post_media
      WHERE id = ?
    `,
    )
      .bind(mediaId)
      .first();

    if (!media) {
      return c.json({ error: "媒体不存在" }, 404);
    }

    const object = await c.env.BUCKET.get(media.file_key);

    if (!object?.body) {
      return c.json({ error: "媒体文件不存在" }, 404);
    }

    const headers = new Headers();

    if (typeof object.writeHttpMetadata === "function") {
      object.writeHttpMetadata(headers);
    }

    headers.set(
      "Content-Type",
      media.file_type ||
        headers.get("Content-Type") ||
        "application/octet-stream",
    );
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("Pragma", "no-cache");
    headers.set("Vary", "Authorization");
    headers.set(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(media.file_name || "image")}"`,
    );

    if (object.httpEtag) {
      headers.set("ETag", object.httpEtag);
    }

    return new Response(object.body, { headers });
  } catch (error) {
    console.error("Read post media error:", error);
    return c.json({ error: "读取媒体失败" }, 500);
  }
});

app.get("/", async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      `
      ${postBaseSelect}
      ORDER BY p.is_pinned DESC, datetime(p.created_at) DESC
    `,
    ).all();

    const posts = await attachMediaToPosts(c, results || []);

    return c.json({ posts });
  } catch (error) {
    console.error("Get posts error:", error);
    return c.json({ error: "获取帖子列表失败" }, 500);
  }
});

app.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");

    const post = await fetchPostById(c.env.DB, id);

    if (!post) {
      return c.json({ error: "帖子不存在" }, 404);
    }

    await c.env.DB.prepare(
      "UPDATE posts SET view_count = view_count + 1 WHERE id = ?",
    )
      .bind(id)
      .run();

    post.view_count = Number(post.view_count || 0) + 1;

    return c.json({
      post: await enrichPost(c, post),
      replies: await getPostReplies(c.env.DB, id),
    });
  } catch (error) {
    console.error("Get post error:", error);
    return c.json({ error: "获取帖子详情失败" }, 500);
  }
});

app.post("/", async (c) => {
  try {
    const parsedRequest = await parsePostRequest(c);
    if (parsedRequest.error) {
      return c.json({ error: parsedRequest.error }, 400);
    }

    const normalizedPayload = normalizeCreatePayload(
      parsedRequest.payload,
      parsedRequest.files,
    );
    if (normalizedPayload.error) {
      return c.json({ error: normalizedPayload.error }, 400);
    }

    const user = c.get("user");
    const result = await c.env.DB.prepare(
      `
      INSERT INTO posts (title, summary, content, post_type, author_id)
      VALUES (?, ?, ?, ?, ?)
    `,
    )
      .bind(
        normalizedPayload.title,
        normalizedPayload.summary || null,
        normalizedPayload.content,
        normalizedPayload.postType,
        user.id,
      )
      .run();

    const postId = Number(result.meta.last_row_id);
    const coverSelection = resolveCoverSelection({
      postType: normalizedPayload.postType,
      retainedMedia: [],
      coverMediaId: normalizedPayload.coverMediaId,
      coverNewIndex: normalizedPayload.coverNewIndex,
      newFiles: parsedRequest.files,
    });

    try {
      await uploadPostMediaFiles(c, {
        postId,
        files: parsedRequest.files,
        postType: normalizedPayload.postType,
        coverNewIndex: coverSelection.coverNewIndex,
        startSortOrder: 0,
      });
    } catch (error) {
      await c.env.DB.prepare("DELETE FROM posts WHERE id = ?")
        .bind(postId)
        .run();
      throw error;
    }

    const post = await fetchPostById(c.env.DB, postId);
    await parseAndNotifyMentions(
      c.env.DB,
      normalizedPayload.content,
      postId,
      user.id,
      user.username,
      "mention",
    );
    return c.json(
      {
        message: "发布成功",
        post: await enrichPost(c, post),
      },
      201,
    );
  } catch (error) {
    console.error("Create post error:", error);
    const status = Number.isInteger(error?.status) ? error.status : 500;
    return c.json({ error: error?.message || "发布失败" }, status);
  }
});

app.put("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const parsedRequest = await parsePostRequest(c);

    if (parsedRequest.error) {
      return c.json({ error: parsedRequest.error }, 400);
    }

    const user = c.get("user");
    const existingPost = await c.env.DB.prepare(
      "SELECT * FROM posts WHERE id = ?",
    )
      .bind(id)
      .first();

    if (!existingPost) {
      return c.json({ error: "帖子不存在" }, 404);
    }

    if (existingPost.author_id !== user.id && user.role !== "admin") {
      return c.json({ error: "无权编辑此帖子" }, 403);
    }

    const existingMedia = await getPostMediaRecords(c.env.DB, id);
    const normalizedPayload = normalizeUpdatePayload(
      existingPost,
      parsedRequest.payload,
      parsedRequest.files,
      existingMedia,
    );

    if (normalizedPayload.error) {
      return c.json({ error: normalizedPayload.error }, 400);
    }

    const retainedMedia = existingMedia.filter((media) =>
      normalizedPayload.retainedMediaIds.includes(Number(media.id)),
    );
    const removedMedia = existingMedia.filter(
      (media) => !normalizedPayload.retainedMediaIds.includes(Number(media.id)),
    );
    const coverSelection = resolveCoverSelection({
      postType: normalizedPayload.postType,
      retainedMedia,
      coverMediaId: normalizedPayload.coverMediaId,
      coverNewIndex: normalizedPayload.coverNewIndex,
      newFiles: parsedRequest.files,
    });

    await c.env.DB.prepare(
      `
      UPDATE posts
      SET title = ?, summary = ?, content = ?, post_type = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    )
      .bind(
        normalizedPayload.title,
        normalizedPayload.summary || null,
        normalizedPayload.content,
        normalizedPayload.postType,
        id,
      )
      .run();

    await updateRetainedMediaUsage(
      c.env.DB,
      retainedMedia,
      normalizedPayload.postType,
      coverSelection.coverMediaId,
    );

    const highestSortOrder = retainedMedia.reduce((max, media) => {
      return Math.max(max, Number(media.sort_order || 0));
    }, -1);
    const removedMediaBytes = getStoredMediaTotalSize(removedMedia);

    await uploadPostMediaFiles(c, {
      postId: id,
      files: parsedRequest.files,
      postType: normalizedPayload.postType,
      coverNewIndex: coverSelection.coverNewIndex,
      startSortOrder: highestSortOrder + 1,
      storageBytesToFree: removedMediaBytes,
    });

    await deleteMediaObjects(c.env.BUCKET, removedMedia);
    await Promise.all(
      removedMedia.map((media) =>
        c.env.DB.prepare("DELETE FROM post_media WHERE id = ?")
          .bind(media.id)
          .run(),
      ),
    );

    const updatedPost = await fetchPostById(c.env.DB, id);

    return c.json({
      message: "更新成功",
      post: await enrichPost(c, updatedPost),
    });
  } catch (error) {
    console.error("Update post error:", error);
    const status = Number.isInteger(error?.status) ? error.status : 500;
    return c.json({ error: error?.message || "更新失败" }, status);
  }
});

app.post("/:id/replies", async (c) => {
  try {
    const id = c.req.param("id");
    const { content, parent_id } = await c.req.json();
    const trimmedContent = String(content || "").trim();

    if (!trimmedContent) {
      return c.json({ error: "Reply content is required" }, 400);
    }

    if (!content) {
      return c.json({ error: "内容为必填项" }, 400);
    }

    const user = c.get("user");
    const post = await c.env.DB.prepare(
      "SELECT id, author_id FROM posts WHERE id = ?",
    )
      .bind(id)
      .first();

    if (!post) {
      return c.json({ error: "帖子不存在" }, 404);
    }

    const normalizedParentId = normalizeNumber(parent_id);
    let parentReply = null;
    if (normalizedParentId !== null) {
      parentReply = await c.env.DB.prepare(
        `
        SELECT id, post_id, author_id
        FROM replies
        WHERE id = ?
      `,
      )
        .bind(normalizedParentId)
        .first();

      /* duplicate validation kept commented to avoid touching encoded text
        return c.json({ error: '要回复的评论不存在或不属于当前帖子' }, 400)
      */
      if (!parentReply || Number(parentReply.post_id) !== Number(id)) {
        return c.json({ error: "要回复的评论不存在或不属于当前帖子" }, 400);
      }
    }

    const result = await c.env.DB.prepare(
      `
      INSERT INTO replies (post_id, author_id, content, parent_id)
      VALUES (?, ?, ?, ?)
    `,
    )
      .bind(id, user.id, trimmedContent, normalizedParentId)
      .run();

    await c.env.DB.prepare(
      "UPDATE posts SET reply_count = reply_count + 1 WHERE id = ?",
    )
      .bind(id)
      .run();

    let createdReply = null;

    try {
      createdReply = await getReplyById(c.env.DB, result.meta.last_row_id);
    } catch (loadReplyError) {
      console.error("Load new reply error:", loadReplyError);
    }

    try {
      // 1. Notify the parent reply author or post author
      const targetUserId = parentReply ? parentReply.author_id : post.author_id;
      if (targetUserId !== user.id) {
        await c.env.DB.prepare(
          "INSERT INTO notifications (user_id, type, source_id, actor_id, message) VALUES (?, ?, ?, ?, ?)",
        )
          .bind(
            targetUserId,
            "post_reply",
            id,
            user.id,
            `${user.username} 回复了您的帖子/评论`,
          )
          .run();
      }

      // 2. Parsed Mentions
      await parseAndNotifyMentions(
        c.env.DB,
        trimmedContent,
        id,
        user.id,
        user.username,
        "mention",
      );
    } catch (notificationError) {
      console.error("Failed to notify reply", notificationError);
    }

    return c.json(
      {
        message: "Reply created",
        reply: createdReply || {
          id: result.meta.last_row_id,
          post_id: Number(id),
          author_id: Number(user.id),
          author_name: user.username || "User",
          content: trimmedContent,
          parent_id: normalizedParentId,
          parent_author_id: null,
          parent_author_name: null,
          created_at: new Date().toISOString(),
        },
      },
      201,
    );
  } catch (error) {
    console.error("Create reply error:", error);
    return c.json({ error: "回复失败" }, 500);
  }
});

app.delete("/:id/replies/:replyId", async (c) => {
  try {
    const postId = Number(c.req.param("id"));
    const replyId = Number(c.req.param("replyId"));
    const user = c.get("user");

    const reply = await c.env.DB.prepare(
      `
      SELECT id, post_id, parent_id, author_id
      FROM replies
      WHERE id = ?
    `,
    )
      .bind(replyId)
      .first();

    if (!reply || Number(reply.post_id) !== postId) {
      return c.json({ error: "评论不存在" }, 404);
    }

    if (
      Number(reply.author_id) !== Number(user.id) &&
      !["teacher", "admin"].includes(user.role)
    ) {
      return c.json({ error: "无权删除该评论" }, 403);
    }

    await c.env.DB.prepare(
      `
      UPDATE replies
      SET parent_id = ?
      WHERE parent_id = ?
    `,
    )
      .bind(reply.parent_id ?? null, reply.id)
      .run();

    await c.env.DB.prepare("DELETE FROM replies WHERE id = ?")
      .bind(reply.id)
      .run();

    await c.env.DB.prepare(
      `
      UPDATE posts
      SET reply_count = CASE WHEN reply_count > 0 THEN reply_count - 1 ELSE 0 END
      WHERE id = ?
    `,
    )
      .bind(postId)
      .run();

    return c.json({
      message: "评论已删除",
      deleted_reply_id: replyId,
      reparent_to: reply.parent_id ?? null,
    });
  } catch (error) {
    console.error("Delete reply error:", error);
    return c.json({ error: "删除评论失败" }, 500);
  }
});

app.delete("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const user = c.get("user");

    const post = await c.env.DB.prepare(
      "SELECT author_id FROM posts WHERE id = ?",
    )
      .bind(id)
      .first();

    if (!post) {
      return c.json({ error: "帖子不存在" }, 404);
    }

    if (post.author_id !== user.id && user.role !== "admin") {
      return c.json({ error: "无权删除此帖子" }, 403);
    }

    const mediaRecords = await getPostMediaRecords(c.env.DB, id);

    await deleteMediaObjects(c.env.BUCKET, mediaRecords);
    await c.env.DB.prepare("DELETE FROM post_media WHERE post_id = ?")
      .bind(id)
      .run();
    await c.env.DB.prepare("DELETE FROM replies WHERE post_id = ?")
      .bind(id)
      .run();
    await c.env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(id).run();

    return c.json({ message: "删除成功" });
  } catch (error) {
    console.error("Delete post error:", error);
    return c.json({ error: "删除失败" }, 500);
  }
});

app.put("/:id/pin", requireRole("teacher", "admin"), async (c) => {
  try {
    const id = c.req.param("id");
    const { is_pinned } = await c.req.json();

    await c.env.DB.prepare("UPDATE posts SET is_pinned = ? WHERE id = ?")
      .bind(is_pinned ? 1 : 0, id)
      .run();

    return c.json({ message: is_pinned ? "置顶成功" : "取消置顶成功" });
  } catch (error) {
    console.error("Pin post error:", error);
    return c.json({ error: "操作失败" }, 500);
  }
});

export default app;
