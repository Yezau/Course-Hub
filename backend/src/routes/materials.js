import { Hono } from "hono";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import { getAuditContext, recordAuditLog } from "../utils/audit.js";
import { getMaterialMaxSizeBytes } from "../utils/env.js";
import { buildContentDisposition } from "../utils/security.js";
import { ensureStorageQuotaForIncomingBytes } from "../utils/storage-quota.js";

const app = new Hono();
const SQL_NOW_UTC8 = "datetime('now', '+8 hours')";

app.use("/*", authMiddleware);

const DANGEROUS_MIME_TYPES = new Set([
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
  "application/javascript",
  "text/javascript",
]);

const MATERIAL_SELECT_FIELDS = `
  m.id,
  m.folder_id,
  m.file_name,
  m.file_size,
  m.file_type,
  m.uploader_id,
  m.download_count,
  m.created_at
`;

const normalizeFolderId = (value) =>
  value === undefined || value === null || value === "" ? null : Number(value);

const isFolderNameConflict = (error) => {
  return String(error?.message || "").includes(
    "UNIQUE constraint failed: material_folders.parent_id, material_folders.name",
  );
};

const normalizeStoredFileName = (value) => {
  const fileName = `${value || "file"}`
    .split(/[\\/]/)
    .pop()
    .replace(/[\r\n]/g, " ")
    .trim()
    .slice(0, 255);

  return fileName || "file";
};

const splitFileName = (name) => {
  const normalizedName = normalizeStoredFileName(name);
  const extensionIndex = normalizedName.lastIndexOf(".");

  if (extensionIndex <= 0) {
    return { baseName: normalizedName, extension: "" };
  }

  return {
    baseName: normalizedName.slice(0, extensionIndex),
    extension: normalizedName.slice(extensionIndex),
  };
};

const buildCopyName = (originalName, existingNames, isFile = false) => {
  const normalizedOriginalName = isFile
    ? normalizeStoredFileName(originalName)
    : `${originalName || ""}`.trim();

  if (!existingNames.has(normalizedOriginalName)) {
    return normalizedOriginalName;
  }

  const { baseName, extension } = isFile
    ? splitFileName(normalizedOriginalName)
    : { baseName: normalizedOriginalName, extension: "" };

  let candidate = `${baseName} - 副本${extension}`;
  let index = 2;

  while (existingNames.has(candidate)) {
    candidate = `${baseName} - 副本 (${index})${extension}`;
    index += 1;
  }

  return candidate;
};

const generateFileKey = (fileName) => {
  return `files/${Date.now()}-${Math.random().toString(36).substring(2, 10)}/${normalizeStoredFileName(fileName)}`;
};

const getFileExtension = (fileName) => {
  const normalizedName = normalizeStoredFileName(fileName);
  const extensionIndex = normalizedName.lastIndexOf(".");

  if (extensionIndex < 0 || extensionIndex === normalizedName.length - 1) {
    return "";
  }

  return normalizedName.slice(extensionIndex + 1).toLowerCase();
};

function getAllowedExtensions(env) {
  const configured = `${env.MATERIAL_ALLOWED_EXTENSIONS || ""}`
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (
    !configured.length ||
    configured.includes("*") ||
    configured.includes("all")
  ) {
    return null;
  }

  return new Set(configured);
}

function validateMaterialFile(file, env) {
  if (!file || typeof file.name !== "string") {
    return "请选择要上传的文件";
  }

  const normalizedFileName = normalizeStoredFileName(file.name);
  const fileExtension = getFileExtension(normalizedFileName);
  const allowedExtensions = getAllowedExtensions(env);
  const maxBytes = getMaterialMaxSizeBytes(env);
  const contentType = `${file.type || ""}`.toLowerCase();

  if (
    allowedExtensions &&
    (!fileExtension || !allowedExtensions.has(fileExtension))
  ) {
    return "当前文件类型不允许上传";
  }

  if (contentType && DANGEROUS_MIME_TYPES.has(contentType)) {
    return "当前文件类型不允许上传";
  }

  if ((file.size || 0) <= 0) {
    return "上传文件不能为空";
  }

  if ((file.size || 0) > maxBytes) {
    return `文件大小不能超过 ${Math.round(maxBytes / 1024 / 1024)} MB`;
  }

  return "";
}

async function getFolderById(db, folderId) {
  if (folderId === null) {
    return null;
  }

  return db
    .prepare(
      `
    SELECT id, parent_id, name
    FROM material_folders
    WHERE id = ?
  `,
    )
    .bind(folderId)
    .first();
}

async function getMaterialById(db, materialId) {
  return db
    .prepare(
      `
    SELECT id, folder_id, file_name, file_key, file_size, file_type, uploader_id, download_count, created_at
    FROM materials
    WHERE id = ?
  `,
    )
    .bind(materialId)
    .first();
}

async function getExistingFolderNames(db, parentId) {
  const query =
    parentId === null
      ? "SELECT name FROM material_folders WHERE parent_id IS NULL"
      : "SELECT name FROM material_folders WHERE parent_id = ?";

  const result =
    parentId === null
      ? await db.prepare(query).all()
      : await db.prepare(query).bind(parentId).all();

  return new Set((result.results || []).map((item) => item.name));
}

async function getExistingMaterialNames(db, folderId) {
  const query =
    folderId === null
      ? "SELECT file_name FROM materials WHERE folder_id IS NULL"
      : "SELECT file_name FROM materials WHERE folder_id = ?";

  const result =
    folderId === null
      ? await db.prepare(query).all()
      : await db.prepare(query).bind(folderId).all();

  return new Set((result.results || []).map((item) => item.file_name));
}

async function getAvailableFolderName(db, parentId, folderName) {
  const existingNames = await getExistingFolderNames(db, parentId);
  return buildCopyName(folderName, existingNames, false);
}

async function getAvailableMaterialName(db, folderId, fileName) {
  const existingNames = await getExistingMaterialNames(db, folderId);
  return buildCopyName(fileName, existingNames, true);
}

async function wouldCreateCircularFolderMove(db, folderId, targetParentId) {
  if (targetParentId === null) {
    return false;
  }

  const normalizedFolderId = Number(folderId);
  const normalizedTargetParentId = Number(targetParentId);

  if (normalizedFolderId === normalizedTargetParentId) {
    return true;
  }

  const foldersResult = await db
    .prepare(
      `
    SELECT id, parent_id
    FROM material_folders
  `,
    )
    .all();

  const folderMap = new Map(
    (foldersResult.results || []).map((folder) => [Number(folder.id), folder]),
  );

  let pointer = folderMap.get(normalizedTargetParentId) || null;
  while (pointer) {
    if (Number(pointer.id) === normalizedFolderId) {
      return true;
    }

    pointer =
      pointer.parent_id === null || pointer.parent_id === undefined
        ? null
        : folderMap.get(Number(pointer.parent_id)) || null;
  }

  return false;
}

async function duplicateMaterial(
  db,
  bucket,
  env,
  material,
  targetFolderId,
  userId,
) {
  const sourceObject = await bucket.get(material.file_key);

  if (!sourceObject?.body) {
    throw new Error("源文件不存在，无法复制");
  }

  await ensureStorageQuotaForIncomingBytes(
    env,
    db,
    material.file_size || sourceObject.size || 0,
  );

  const nextFileName = await getAvailableMaterialName(
    db,
    targetFolderId,
    material.file_name,
  );
  const nextFileKey = generateFileKey(nextFileName);
  const contentType =
    material.file_type || sourceObject.httpMetadata?.contentType || undefined;

  if (contentType) {
    await bucket.put(nextFileKey, sourceObject.body, {
      httpMetadata: { contentType },
    });
  } else {
    await bucket.put(nextFileKey, sourceObject.body);
  }

  const result = await db
    .prepare(
      `
    INSERT INTO materials (folder_id, file_name, file_key, file_size, file_type, uploader_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ${SQL_NOW_UTC8})
  `,
    )
    .bind(
      targetFolderId,
      nextFileName,
      nextFileKey,
      material.file_size,
      material.file_type,
      userId,
    )
    .run();

  return {
    id: result.meta.last_row_id,
    kind: "file",
    name: nextFileName,
  };
}

async function duplicateFolderTree(
  db,
  bucket,
  env,
  sourceFolderId,
  targetParentId,
  userId,
) {
  const sourceFolder = await getFolderById(db, sourceFolderId);

  if (!sourceFolder) {
    throw new Error("源文件夹不存在");
  }

  const nextFolderName = await getAvailableFolderName(
    db,
    targetParentId,
    sourceFolder.name,
  );
  const folderResult = await db
    .prepare(
      `
    INSERT INTO material_folders (parent_id, name, creator_id, created_at)
    VALUES (?, ?, ?, ${SQL_NOW_UTC8})
  `,
    )
    .bind(targetParentId, nextFolderName, userId)
    .run();

  const nextFolderId = Number(folderResult.meta.last_row_id);

  const materialsResult = await db
    .prepare(
      `
    SELECT id, folder_id, file_name, file_key, file_size, file_type
    FROM materials
    WHERE folder_id = ?
    ORDER BY id
  `,
    )
    .bind(sourceFolderId)
    .all();

  for (const material of materialsResult.results || []) {
    await duplicateMaterial(db, bucket, env, material, nextFolderId, userId);
  }

  const childrenResult = await db
    .prepare(
      `
    SELECT id
    FROM material_folders
    WHERE parent_id = ?
    ORDER BY id
  `,
    )
    .bind(sourceFolderId)
    .all();

  for (const child of childrenResult.results || []) {
    await duplicateFolderTree(
      db,
      bucket,
      env,
      Number(child.id),
      nextFolderId,
      userId,
    );
  }

  return {
    id: nextFolderId,
    kind: "folder",
    name: nextFolderName,
  };
}

async function collectFolderTreeIds(db, rootFolderId) {
  const rootFolder = await getFolderById(db, rootFolderId);
  if (!rootFolder) {
    return null;
  }

  const foldersResult = await db
    .prepare(
      `
    SELECT id, parent_id
    FROM material_folders
    ORDER BY id
  `,
    )
    .all();

  const childrenMap = new Map();
  for (const folder of foldersResult.results || []) {
    const parentId = normalizeFolderId(folder.parent_id);
    const key = parentId === null ? "root" : String(parentId);
    const children = childrenMap.get(key) || [];
    children.push(Number(folder.id));
    childrenMap.set(key, children);
  }

  const folderIds = [];
  const stack = [Number(rootFolderId)];

  while (stack.length) {
    const currentId = stack.pop();
    folderIds.push(currentId);

    const childIds = childrenMap.get(String(currentId)) || [];
    for (let index = childIds.length - 1; index >= 0; index -= 1) {
      stack.push(childIds[index]);
    }
  }

  return folderIds;
}

async function getMaterialsInFolders(db, folderIds) {
  if (!folderIds.length) {
    return [];
  }

  const materials = [];

  for (const folderId of folderIds) {
    const result = await db
      .prepare(
        `
      SELECT id, file_key
      FROM materials
      WHERE folder_id = ?
      ORDER BY id
    `,
      )
      .bind(folderId)
      .all();

    materials.push(
      ...(result.results || []).map((item) => ({
        id: Number(item.id),
        file_key: item.file_key,
      })),
    );
  }

  return materials;
}

async function deleteFolderTree(db, bucket, folderId) {
  const folderIds = await collectFolderTreeIds(db, folderId);
  if (!folderIds) {
    return null;
  }

  const materials = await getMaterialsInFolders(db, folderIds);

  for (const material of materials) {
    try {
      await bucket.delete(material.file_key);
    } catch (error) {
      console.error("Delete material from R2 error:", error);
    }

    await db
      .prepare(
        `
      DELETE FROM materials
      WHERE id = ?
    `,
      )
      .bind(material.id)
      .run();
  }

  for (const currentFolderId of [...folderIds].reverse()) {
    await db
      .prepare(
        `
      DELETE FROM material_folders
      WHERE id = ?
    `,
      )
      .bind(currentFolderId)
      .run();
  }

  return {
    deleted_folders: folderIds.length,
    deleted_files: materials.length,
  };
}

app.get("/folders", async (c) => {
  try {
    const parentId = c.req.query("parent_id");
    const all = c.req.query("all") === "1";
    const query = `
      SELECT
        f.id,
        f.parent_id,
        f.name,
        f.creator_id,
        f.created_at,
        (SELECT COUNT(*) FROM material_folders child WHERE child.parent_id = f.id) AS child_count,
        (SELECT COUNT(*) FROM materials m WHERE m.folder_id = f.id) AS material_count
      FROM material_folders f
      ${all ? "" : parentId ? "WHERE f.parent_id = ?" : "WHERE f.parent_id IS NULL"}
      ORDER BY f.name
    `;
    const params = !all && parentId ? [Number.parseInt(parentId, 10)] : [];
    const result = await c.env.DB.prepare(query)
      .bind(...params)
      .all();

    return c.json({ folders: result.results || [] });
  } catch (error) {
    console.error("Get folders error:", error);
    return c.json({ error: "获取文件夹列表失败" }, 500);
  }
});

app.post("/folders", requireRole("teacher", "admin"), async (c) => {
  try {
    const user = c.get("user");
    const body = await c.req.json();
    const name = `${body?.name || ""}`.trim();
    const parentId = normalizeFolderId(body?.parent_id);

    if (!name) {
      return c.json({ error: "文件夹名称不能为空" }, 400);
    }

    if (parentId !== null) {
      const parentFolder = await getFolderById(c.env.DB, parentId);
      if (!parentFolder) {
        return c.json({ error: "目标目录不存在" }, 404);
      }
    }

    const result = await c.env.DB.prepare(
      `
      INSERT INTO material_folders (parent_id, name, creator_id, created_at)
      VALUES (?, ?, ?, ${SQL_NOW_UTC8})
    `,
    )
      .bind(parentId, name, user.id)
      .run();

    return c.json({ id: result.meta.last_row_id, name }, 201);
  } catch (error) {
    console.error("Create folder error:", error);
    if (isFolderNameConflict(error)) {
      return c.json({ error: "同一目录下已存在同名文件夹" }, 400);
    }

    return c.json({ error: "创建文件夹失败" }, 500);
  }
});

app.patch("/folders/:id", requireRole("teacher", "admin"), async (c) => {
  try {
    const folderId = normalizeFolderId(c.req.param("id"));
    const body = await c.req.json();
    const currentFolder = await getFolderById(c.env.DB, folderId);

    if (!currentFolder) {
      return c.json({ error: "文件夹不存在" }, 404);
    }

    if (body.name !== undefined) {
      const normalizedName = `${body.name || ""}`.trim();
      if (!normalizedName) {
        return c.json({ error: "文件夹名称不能为空" }, 400);
      }

      await c.env.DB.prepare(
        `
        UPDATE material_folders
        SET name = ?
        WHERE id = ?
      `,
      )
        .bind(normalizedName, folderId)
        .run();
    }

    if (body.parent_id !== undefined) {
      const parentId = normalizeFolderId(body.parent_id);

      if (parentId !== null) {
        const targetFolder = await getFolderById(c.env.DB, parentId);
        if (!targetFolder) {
          return c.json({ error: "目标目录不存在" }, 404);
        }
      }

      if (await wouldCreateCircularFolderMove(c.env.DB, folderId, parentId)) {
        return c.json({ error: "不能将文件夹移动到自身或其子目录中" }, 400);
      }

      await c.env.DB.prepare(
        `
        UPDATE material_folders
        SET parent_id = ?
        WHERE id = ?
      `,
      )
        .bind(parentId, folderId)
        .run();
    }

    const updated = await c.env.DB.prepare(
      `
      SELECT id, name, parent_id
      FROM material_folders
      WHERE id = ?
    `,
    )
      .bind(folderId)
      .first();

    return c.json({ message: "文件夹更新成功", folder: updated });
  } catch (error) {
    console.error("Update folder error:", error);
    if (isFolderNameConflict(error)) {
      return c.json({ error: "同一目录下已存在同名文件夹" }, 400);
    }

    return c.json({ error: "更新文件夹失败" }, 500);
  }
});

app.delete("/folders/:id", requireRole("teacher", "admin"), async (c) => {
  try {
    const folderId = normalizeFolderId(c.req.param("id"));
    const result = await deleteFolderTree(c.env.DB, c.env.BUCKET, folderId);

    if (!result) {
      return c.json({ error: "文件夹不存在" }, 404);
    }

    return c.json({
      message: result.deleted_files
        ? `删除成功，共删除 ${result.deleted_folders} 个文件夹、${result.deleted_files} 个文件`
        : `删除成功，共删除 ${result.deleted_folders} 个文件夹`,
      ...result,
    });
  } catch (error) {
    console.error("Delete folder error:", error);
    return c.json({ error: "删除文件夹失败" }, 500);
  }
});

app.get("/", async (c) => {
  try {
    const folderId = c.req.query("folder_id");
    const query = `
      SELECT ${MATERIAL_SELECT_FIELDS},
             COALESCE(u.real_name, u.username) AS uploader_name
      FROM materials m
      LEFT JOIN users u ON m.uploader_id = u.id
      ${folderId ? "WHERE m.folder_id = ?" : "WHERE m.folder_id IS NULL"}
      ORDER BY m.file_name
    `;
    const params = folderId ? [Number.parseInt(folderId, 10)] : [];
    const result = await c.env.DB.prepare(query)
      .bind(...params)
      .all();

    return c.json({ materials: result.results || [] });
  } catch (error) {
    console.error("Get materials error:", error);
    return c.json({ error: "获取文件列表失败" }, 500);
  }
});

app.get("/:id", async (c) => {
  try {
    const material = await c.env.DB.prepare(
      `
      SELECT ${MATERIAL_SELECT_FIELDS},
             COALESCE(u.real_name, u.username) AS uploader_name,
             u.username AS uploader_username,
             f.name AS folder_name
      FROM materials m
      LEFT JOIN users u ON m.uploader_id = u.id
      LEFT JOIN material_folders f ON m.folder_id = f.id
      WHERE m.id = ?
    `,
    )
      .bind(c.req.param("id"))
      .first();

    if (!material) {
      return c.json({ error: "文件不存在" }, 404);
    }

    return c.json({ material });
  } catch (error) {
    console.error("Get material detail error:", error);
    return c.json({ error: "获取文件详情失败" }, 500);
  }
});

app.post("/copy", requireRole("teacher", "admin"), async (c) => {
  try {
    const user = c.get("user");
    const body = await c.req.json();
    const targetFolderId = normalizeFolderId(body.target_folder_id);
    const normalizedEntries = Array.isArray(body.entries)
      ? Array.from(
          new Map(
            body.entries
              .filter(
                (entry) =>
                  entry?.kind && entry?.id !== undefined && entry?.id !== null,
              )
              .map((entry) => [
                `${entry.kind}-${Number(entry.id)}`,
                { kind: entry.kind, id: Number(entry.id) },
              ]),
          ).values(),
        )
      : [];

    if (!normalizedEntries.length) {
      return c.json({ error: "请选择要复制的项目" }, 400);
    }

    if (targetFolderId !== null) {
      const targetFolder = await getFolderById(c.env.DB, targetFolderId);
      if (!targetFolder) {
        return c.json({ error: "目标目录不存在" }, 404);
      }
    }

    const copied = [];
    const failed = [];

    for (const entry of normalizedEntries) {
      try {
        if (entry.kind === "folder") {
          if (
            await wouldCreateCircularFolderMove(
              c.env.DB,
              entry.id,
              targetFolderId,
            )
          ) {
            failed.push({
              kind: entry.kind,
              id: entry.id,
              reason: "不能复制到自身或子目录中",
            });
            continue;
          }

          copied.push(
            await duplicateFolderTree(
              c.env.DB,
              c.env.BUCKET,
              c.env,
              entry.id,
              targetFolderId,
              user.id,
            ),
          );
          continue;
        }

        if (entry.kind === "file") {
          const material = await getMaterialById(c.env.DB, entry.id);
          if (!material) {
            failed.push({
              kind: entry.kind,
              id: entry.id,
              reason: "源文件不存在",
            });
            continue;
          }

          copied.push(
            await duplicateMaterial(
              c.env.DB,
              c.env.BUCKET,
              c.env,
              material,
              targetFolderId,
              user.id,
            ),
          );
          continue;
        }

        failed.push({
          kind: entry.kind,
          id: entry.id,
          reason: "不支持的复制类型",
        });
      } catch (error) {
        console.error("Copy entry error:", error);
        failed.push({
          kind: entry.kind,
          id: entry.id,
          reason: error.message || "复制失败",
        });
      }
    }

    if (!copied.length) {
      return c.json({ error: failed[0]?.reason || "复制失败", failed }, 400);
    }

    return c.json({
      copied,
      failed,
      copied_count: copied.length,
      failed_count: failed.length,
      message: failed.length
        ? `已复制 ${copied.length} 项，失败 ${failed.length} 项`
        : `已复制 ${copied.length} 项`,
    });
  } catch (error) {
    console.error("Copy entries error:", error);
    return c.json({ error: "复制失败" }, 500);
  }
});

app.post("/", requireRole("teacher", "admin"), async (c) => {
  try {
    const user = c.get("user");
    const formData = await c.req.formData();
    const file = formData.get("file");
    const folderId = normalizeFolderId(formData.get("folder_id"));

    const fileError = validateMaterialFile(file, c.env);
    if (fileError) {
      return c.json({ error: fileError }, 400);
    }

    if (folderId !== null) {
      const folder = await getFolderById(c.env.DB, folderId);
      if (!folder) {
        return c.json({ error: "目标目录不存在" }, 404);
      }
    }

    const fileName = normalizeStoredFileName(file.name);
    const fileKey = generateFileKey(fileName);
    const contentType = file.type || "application/octet-stream";

    await ensureStorageQuotaForIncomingBytes(c.env, c.env.DB, file.size || 0);

    await c.env.BUCKET.put(fileKey, file.stream(), {
      httpMetadata: { contentType },
    });

    const result = await c.env.DB.prepare(
      `
      INSERT INTO materials (folder_id, file_name, file_key, file_size, file_type, uploader_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ${SQL_NOW_UTC8})
    `,
    )
      .bind(folderId, fileName, fileKey, file.size, contentType, user.id)
      .run();

    await recordAuditLog(c.env.DB, {
      ...getAuditContext(c),
      actorId: user.id,
      action: "material.upload",
      targetType: "material",
      targetId: result.meta.last_row_id,
      summary: `上传资料 ${fileName}`,
      details: {
        folder_id: folderId,
        file_size: file.size,
      },
    });

    return c.json(
      {
        id: result.meta.last_row_id,
        file_name: fileName,
        file_size: file.size,
      },
      201,
    );
  } catch (error) {
    console.error("Upload error:", error);
    const status = Number.isInteger(error?.status) ? error.status : 500;
    return c.json({ error: error?.message || "上传失败" }, status);
  }
});

app.patch("/:id", requireRole("teacher", "admin"), async (c) => {
  try {
    const materialId = c.req.param("id");
    const body = await c.req.json();
    const material = await getMaterialById(c.env.DB, materialId);

    if (!material) {
      return c.json({ error: "文件不存在" }, 404);
    }

    const hasFolderId = Object.prototype.hasOwnProperty.call(body, "folder_id");
    const hasFileName = typeof body.file_name === "string";
    const folderId = hasFolderId
      ? normalizeFolderId(body.folder_id)
      : normalizeFolderId(material.folder_id);
    const fileName = hasFileName
      ? normalizeStoredFileName(body.file_name)
      : material.file_name;

    if (!hasFolderId && !hasFileName) {
      return c.json({ error: "缺少更新内容" }, 400);
    }

    if (!fileName) {
      return c.json({ error: "文件名称不能为空" }, 400);
    }

    if (folderId !== null) {
      const targetFolder = await getFolderById(c.env.DB, folderId);
      if (!targetFolder) {
        return c.json({ error: "目标目录不存在" }, 404);
      }
    }

    await c.env.DB.prepare(
      `
      UPDATE materials
      SET folder_id = ?, file_name = ?
      WHERE id = ?
    `,
    )
      .bind(folderId, fileName, materialId)
      .run();

    const updated = await c.env.DB.prepare(
      `
      SELECT id, file_name, folder_id
      FROM materials
      WHERE id = ?
    `,
    )
      .bind(materialId)
      .first();

    const message =
      hasFolderId && hasFileName
        ? "文件更新成功"
        : hasFileName
          ? "重命名成功"
          : "移动成功";

    return c.json({ message, material: updated });
  } catch (error) {
    console.error("Update material error:", error);
    return c.json({ error: "更新文件失败" }, 500);
  }
});

app.get("/:id/download", async (c) => {
  try {
    const material = await c.env.DB.prepare(
      `
      SELECT id, file_key, file_name, file_type
      FROM materials
      WHERE id = ?
    `,
    )
      .bind(c.req.param("id"))
      .first();

    if (!material) {
      return c.json({ error: "文件不存在" }, 404);
    }

    const object = await c.env.BUCKET.get(material.file_key);
    if (!object?.body) {
      return c.json({ error: "文件内容不存在" }, 404);
    }

    await c.env.DB.prepare(
      `
      UPDATE materials
      SET download_count = download_count + 1
      WHERE id = ?
    `,
    )
      .bind(material.id)
      .run();

    const disposition =
      c.req.query("disposition") === "inline" ? "inline" : "attachment";
    const contentType =
      object.httpMetadata?.contentType ||
      material.file_type ||
      "application/octet-stream";

    return new Response(object.body, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(object.size || 0),
        "Content-Disposition": buildContentDisposition(
          material.file_name,
          disposition,
        ),
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("Download error:", error);
    return c.json({ error: "下载文件失败" }, 500);
  }
});

app.delete("/:id", requireRole("teacher", "admin"), async (c) => {
  try {
    const user = c.get("user");
    const material = await c.env.DB.prepare(
      `
      SELECT id, file_key, file_name
      FROM materials
      WHERE id = ?
    `,
    )
      .bind(c.req.param("id"))
      .first();

    if (!material) {
      return c.json({ error: "文件不存在" }, 404);
    }

    try {
      await c.env.BUCKET.delete(material.file_key);
    } catch (error) {
      console.error("Delete from R2 error:", error);
    }

    await c.env.DB.prepare(
      `
      DELETE FROM materials
      WHERE id = ?
    `,
    )
      .bind(material.id)
      .run();

    await recordAuditLog(c.env.DB, {
      ...getAuditContext(c),
      actorId: user.id,
      action: "material.delete",
      targetType: "material",
      targetId: material.id,
      summary: `删除资料 ${material.file_name}`,
    });

    return c.json({ message: "删除成功" });
  } catch (error) {
    console.error("Delete material error:", error);
    return c.json({ error: "删除文件失败" }, 500);
  }
});

export default app;
