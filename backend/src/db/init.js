import bcrypt from "bcryptjs";
import { DEFAULT_SITE_SETTINGS } from "../utils/site-settings.js";
import {
  createHttpError,
  normalizeOptionalString,
  validateEmail,
  validatePassword,
  validateRealName,
  validateUsername,
} from "../utils/validation.js";

const LEGACY_SITE_SETTING_MIGRATIONS = [
  {
    key: "site_name",
    from: "\u81ea\u52a8\u63a7\u5236\u539f\u7406\u8bfe\u7a0b\u5e73\u53f0",
    to: DEFAULT_SITE_SETTINGS.site_name,
  },
  {
    key: "homepage_title",
    from: "\u81ea\u52a8\u63a7\u5236\u539f\u7406\u8bfe\u7a0b\u5728\u7ebf\u5b66\u4e60\u5e73\u53f0",
    to: DEFAULT_SITE_SETTINGS.homepage_title,
  },
];

const OBSOLETE_SITE_SETTING_KEYS = ["site_short_name", "site_tagline"];
const RUNTIME_SCHEMA_VERSION_KEY = "runtime_schema_version";
const RUNTIME_SCHEMA_VERSION = "20260403";

async function isRuntimeSchemaUpToDate(db) {
  try {
    const settingsTable = await db
      .prepare(
        `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name = 'site_settings'
        LIMIT 1
      `,
      )
      .first();

    if (!settingsTable?.name) {
      return false;
    }

    const marker = await db
      .prepare(
        `
        SELECT setting_value
        FROM site_settings
        WHERE setting_key = ?
        LIMIT 1
      `,
      )
      .bind(RUNTIME_SCHEMA_VERSION_KEY)
      .first();

    return `${marker?.setting_value || ""}`.trim() === RUNTIME_SCHEMA_VERSION;
  } catch (error) {
    return false;
  }
}

async function updateRuntimeSchemaVersion(db) {
  await db
    .prepare(
      `
      INSERT INTO site_settings (setting_key, setting_value, updated_by, updated_at)
      VALUES (?, ?, NULL, CURRENT_TIMESTAMP)
      ON CONFLICT(setting_key) DO UPDATE SET
        setting_value = excluded.setting_value,
        updated_by = excluded.updated_by,
        updated_at = CURRENT_TIMESTAMP
    `,
    )
    .bind(RUNTIME_SCHEMA_VERSION_KEY, RUNTIME_SCHEMA_VERSION)
    .run();
}

export async function initializeDatabase(db, env = {}) {
  try {
    if (await isRuntimeSchemaUpToDate(db)) {
      return true;
    }

    await migrateLegacyMaterialsTable(db);
    await createCoreTables(db);
    await ensureUserSchemaMigration(db);
    await ensurePostSchemaMigration(db);
    await ensureAssignmentSchemaMigration(db);
    await ensureSiteSettingsSchema(db);
    await ensureNotificationsSchema(db);
    await ensureSiteSettingsDefaults(db, env);
    await migrateLegacySiteSettingsDefaults(db);
    await removeObsoleteSiteSettings(db);
    await insertDefaultData(db, env);
    await updateRuntimeSchemaVersion(db);
    return true;
  } catch (error) {
    console.error("Database initialization error:", error);
    throw error;
  }
}

export async function getInstallationStatus(db) {
  const userCountResult = await db
    .prepare("SELECT COUNT(*) AS count FROM users")
    .first();
  const userCount = Number(userCountResult?.count || 0);

  const adminUser = await db
    .prepare(
      `
        SELECT id
        FROM users
        WHERE role = 'admin'
        LIMIT 1
      `,
    )
    .first();

  const hasAdmin = Boolean(adminUser?.id);

  return {
    setupRequired: userCount === 0 || !hasAdmin,
    userCount,
    hasAdmin,
  };
}

function getBootstrapDefaults(env = {}) {
  const currentYear = new Date().getFullYear();
  return {
    courseName: env.COURSE_NAME || "示例课程",
    courseDescription: env.COURSE_DESCRIPTION || "示例课程介绍",
    defaultSemester: env.COURSE_SEMESTER || `${currentYear}秋`,
  };
}

export async function completeInstallation(db, payload = {}, env = {}) {
  const installationStatus = await getInstallationStatus(db);
  if (!installationStatus.setupRequired) {
    throw createHttpError(409, "系统已完成初始化，无需再次执行安装向导");
  }

  const defaults = getBootstrapDefaults(env);
  const adminUsername = normalizeOptionalString(
    payload.admin_username || payload.username,
  );
  const adminPassword =
    `${payload.admin_password || payload.password || ""}`.trim();
  const confirmPassword =
    `${payload.confirm_password || payload.confirmPassword || ""}`.trim();
  const adminRealName =
    normalizeOptionalString(payload.admin_real_name || payload.real_name) ||
    adminUsername;
  const adminEmail = normalizeOptionalString(
    payload.admin_email || payload.email,
  );
  const courseName =
    normalizeOptionalString(payload.course_name) || defaults.courseName;
  const courseDescription =
    normalizeOptionalString(payload.course_description) ||
    defaults.courseDescription;
  const defaultSemester =
    normalizeOptionalString(payload.course_semester) ||
    defaults.defaultSemester;

  if (!adminUsername) {
    throw createHttpError(400, "请填写管理员用户名");
  }

  if (!adminPassword) {
    throw createHttpError(400, "请填写管理员密码");
  }

  if (!confirmPassword) {
    throw createHttpError(400, "请再次输入管理员密码进行确认");
  }

  if (adminPassword !== confirmPassword) {
    throw createHttpError(400, "两次输入的密码不一致");
  }

  const validationErrors = [
    validateUsername(adminUsername),
    validateRealName(adminRealName),
    validateEmail(adminEmail),
    validatePassword(adminPassword),
  ].filter(Boolean);

  if (validationErrors.length) {
    throw createHttpError(400, validationErrors[0]);
  }

  try {
    const adminId = await insertProductionBootstrapData(db, {
      courseName,
      courseDescription,
      defaultSemester,
      adminUsername,
      adminEmail,
      adminRealName,
      adminPassword,
    });

    return {
      adminId,
      adminUsername,
      courseName,
      defaultSemester,
    };
  } catch (error) {
    if (`${error?.message || ""}`.includes("UNIQUE constraint failed")) {
      throw createHttpError(409, "管理员用户名或邮箱已存在，请修改后重试");
    }

    throw error;
  }
}

async function migrateLegacyMaterialsTable(db) {
  const tableInfo = await db.prepare("PRAGMA table_info(materials)").all();
  const columnNames = tableInfo.results?.map((column) => column.name) || [];

  if (!columnNames.includes("title")) {
    return;
  }

  await db
    .prepare(
      `
    CREATE TABLE IF NOT EXISTS materials_backup AS
    SELECT id, folder_id, file_name, file_size, file_type, uploader_id, download_count, created_at
    FROM materials
  `,
    )
    .run();

  await db.prepare("DROP TABLE IF EXISTS materials").run();
  await db.prepare("DROP TABLE IF EXISTS material_folders").run();
}

async function createCoreTables(db) {
  const statements = [
    `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'student',
        real_name VARCHAR(50),
        student_id VARCHAR(20),
        avatar_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS material_folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_id INTEGER,
        name VARCHAR(255) NOT NULL,
        creator_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (parent_id) REFERENCES material_folders(id),
        FOREIGN KEY (creator_id) REFERENCES users(id),
        UNIQUE(parent_id, name)
      )
    `,
    "CREATE INDEX IF NOT EXISTS idx_folder_parent ON material_folders(parent_id)",
    `
      CREATE TABLE IF NOT EXISTS materials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        folder_id INTEGER,
        file_name VARCHAR(255) NOT NULL,
        file_key VARCHAR(255) NOT NULL UNIQUE,
        file_size INTEGER NOT NULL,
        file_type VARCHAR(100),
        uploader_id INTEGER NOT NULL,
        download_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (folder_id) REFERENCES material_folders(id),
        FOREIGN KEY (uploader_id) REFERENCES users(id)
      )
    `,
    "CREATE INDEX IF NOT EXISTS idx_folder_materials ON materials(folder_id)",
    "CREATE INDEX IF NOT EXISTS idx_material_uploader ON materials(uploader_id)",
    `
      CREATE TABLE IF NOT EXISTS assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER NOT NULL DEFAULT 1,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        available_from DATETIME,
        due_date DATETIME,
        total_score INTEGER DEFAULT 100,
        reminder_hours INTEGER NOT NULL DEFAULT 72,
        is_closed BOOLEAN NOT NULL DEFAULT FALSE,
        closed_at DATETIME,
        closed_by INTEGER,
        attachment_key TEXT,
        created_by INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id),
        FOREIGN KEY (closed_by) REFERENCES users(id)
      )
    `,
    "CREATE INDEX IF NOT EXISTS idx_course_assignments ON assignments(course_id)",
    "CREATE INDEX IF NOT EXISTS idx_available_from ON assignments(available_from)",
    "CREATE INDEX IF NOT EXISTS idx_due_date ON assignments(due_date)",
    "CREATE INDEX IF NOT EXISTS idx_assignment_closed ON assignments(is_closed)",
    `
      CREATE TABLE IF NOT EXISTS submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        assignment_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        content TEXT,
        file_keys TEXT,
        score INTEGER,
        feedback TEXT,
        status VARCHAR(20) DEFAULT 'submitted',
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        graded_at DATETIME,
        graded_by INTEGER,
        FOREIGN KEY (assignment_id) REFERENCES assignments(id),
        FOREIGN KEY (student_id) REFERENCES users(id),
        FOREIGN KEY (graded_by) REFERENCES users(id),
        UNIQUE(assignment_id, student_id)
      )
    `,
    "CREATE INDEX IF NOT EXISTS idx_assignment_submissions ON submissions(assignment_id)",
    "CREATE INDEX IF NOT EXISTS idx_student_submissions ON submissions(student_id)",
    `
      CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER NOT NULL DEFAULT 1,
        author_id INTEGER NOT NULL,
        title VARCHAR(200) NOT NULL DEFAULT '',
        post_type VARCHAR(20) NOT NULL DEFAULT 'article',
        summary TEXT,
        content TEXT NOT NULL,
        is_pinned BOOLEAN DEFAULT FALSE,
        view_count INTEGER DEFAULT 0,
        reply_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (author_id) REFERENCES users(id)
      )
    `,
    "CREATE INDEX IF NOT EXISTS idx_course_posts ON posts(course_id)",
    "CREATE INDEX IF NOT EXISTS idx_pinned ON posts(is_pinned)",
    "CREATE INDEX IF NOT EXISTS idx_post_type ON posts(post_type)",
    `
      CREATE TABLE IF NOT EXISTS post_media (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_key VARCHAR(255) NOT NULL UNIQUE,
        file_size INTEGER NOT NULL DEFAULT 0,
        file_type VARCHAR(100),
        usage VARCHAR(20) NOT NULL DEFAULT 'gallery',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (post_id) REFERENCES posts(id)
      )
    `,
    "CREATE INDEX IF NOT EXISTS idx_post_media_post ON post_media(post_id)",
    "CREATE INDEX IF NOT EXISTS idx_post_media_usage ON post_media(usage)",
    `
      CREATE TABLE IF NOT EXISTS replies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL,
        author_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        parent_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (post_id) REFERENCES posts(id),
        FOREIGN KEY (author_id) REFERENCES users(id),
        FOREIGN KEY (parent_id) REFERENCES replies(id)
      )
    `,
    "CREATE INDEX IF NOT EXISTS idx_post_replies ON replies(post_id)",
    "CREATE INDEX IF NOT EXISTS idx_parent_replies ON replies(parent_id)",
    `
      CREATE TABLE IF NOT EXISTS site_settings (
        setting_key TEXT PRIMARY KEY,
        setting_value TEXT,
        updated_by INTEGER,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (updated_by) REFERENCES users(id)
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type VARCHAR(50) NOT NULL,
        source_id INTEGER,
        actor_id INTEGER,
        message TEXT,
        is_read BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (actor_id) REFERENCES users(id)
      )
    `,
    "CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read)",
  ];

  for (const statement of statements) {
    await db.prepare(statement).run();
  }
}

async function ensureColumn(db, tableName, columnName, alterSql) {
  const tableInfo = await db.prepare(`PRAGMA table_info(${tableName})`).all();
  const columnNames = tableInfo.results?.map((column) => column.name) || [];

  if (!columnNames.includes(columnName)) {
    await db.prepare(alterSql).run();
  }
}

async function ensureUserSchemaMigration(db) {
  await ensureColumn(
    db,
    "users",
    "real_name",
    "ALTER TABLE users ADD COLUMN real_name VARCHAR(50)",
  );

  await ensureColumn(
    db,
    "users",
    "student_id",
    "ALTER TABLE users ADD COLUMN student_id VARCHAR(20)",
  );

  await ensureColumn(
    db,
    "users",
    "avatar_url",
    "ALTER TABLE users ADD COLUMN avatar_url TEXT",
  );

  await ensureColumn(
    db,
    "users",
    "updated_at",
    "ALTER TABLE users ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP",
  );

  await ensureColumn(
    db,
    "users",
    "last_login",
    "ALTER TABLE users ADD COLUMN last_login DATETIME",
  );

  const duplicateStudentId = await db
    .prepare(
      `
    SELECT student_id, COUNT(*) AS count
    FROM users
    WHERE student_id IS NOT NULL AND TRIM(student_id) != ''
    GROUP BY student_id
    HAVING COUNT(*) > 1
    LIMIT 1
  `,
    )
    .first();

  if (!duplicateStudentId) {
    await db
      .prepare(
        `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_student_id_unique
      ON users(student_id)
      WHERE student_id IS NOT NULL AND student_id != ''
    `,
      )
      .run();
  }
}

async function ensurePostSchemaMigration(db) {
  await ensureColumn(
    db,
    "posts",
    "post_type",
    "ALTER TABLE posts ADD COLUMN post_type VARCHAR(20) NOT NULL DEFAULT 'article'",
  );

  await ensureColumn(
    db,
    "posts",
    "summary",
    "ALTER TABLE posts ADD COLUMN summary TEXT",
  );

  await db
    .prepare(
      `
    CREATE TABLE IF NOT EXISTS post_media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      file_key VARCHAR(255) NOT NULL UNIQUE,
      file_size INTEGER NOT NULL DEFAULT 0,
      file_type VARCHAR(100),
      usage VARCHAR(20) NOT NULL DEFAULT 'gallery',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES posts(id)
    )
  `,
    )
    .run();

  await db
    .prepare(
      "CREATE INDEX IF NOT EXISTS idx_post_media_post ON post_media(post_id)",
    )
    .run();
  await db
    .prepare(
      "CREATE INDEX IF NOT EXISTS idx_post_media_usage ON post_media(usage)",
    )
    .run();
  await db
    .prepare("CREATE INDEX IF NOT EXISTS idx_post_type ON posts(post_type)")
    .run();
}

export async function ensureAssignmentSchemaMigration(db) {
  await ensureColumn(
    db,
    "assignments",
    "available_from",
    "ALTER TABLE assignments ADD COLUMN available_from DATETIME",
  );

  await ensureColumn(
    db,
    "assignments",
    "reminder_hours",
    "ALTER TABLE assignments ADD COLUMN reminder_hours INTEGER NOT NULL DEFAULT 72",
  );

  await ensureColumn(
    db,
    "assignments",
    "is_closed",
    "ALTER TABLE assignments ADD COLUMN is_closed BOOLEAN NOT NULL DEFAULT FALSE",
  );

  await ensureColumn(
    db,
    "assignments",
    "closed_at",
    "ALTER TABLE assignments ADD COLUMN closed_at DATETIME",
  );

  await ensureColumn(
    db,
    "assignments",
    "closed_by",
    "ALTER TABLE assignments ADD COLUMN closed_by INTEGER",
  );

  await db
    .prepare(
      "CREATE INDEX IF NOT EXISTS idx_available_from ON assignments(available_from)",
    )
    .run();
  await db
    .prepare(
      "CREATE INDEX IF NOT EXISTS idx_assignment_closed ON assignments(is_closed)",
    )
    .run();
}

async function ensureSiteSettingsSchema(db) {
  await db
    .prepare(
      `
    CREATE TABLE IF NOT EXISTS site_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT,
      updated_by INTEGER,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (updated_by) REFERENCES users(id)
    )
  `,
    )
    .run();
}

async function ensureNotificationsSchema(db) {
  await db
    .prepare(
      `
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type VARCHAR(50) NOT NULL,
        source_id INTEGER,
        actor_id INTEGER,
        message TEXT,
        is_read BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (actor_id) REFERENCES users(id)
      )
    `,
    )
    .run();

  await db
    .prepare(
      "CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read)",
    )
    .run();
}

async function ensureSiteSettingsDefaults(db, env = {}) {
  const defaults = {
    ...DEFAULT_SITE_SETTINGS,
    site_name: env.SITE_NAME || DEFAULT_SITE_SETTINGS.site_name,
    site_description:
      env.SITE_DESCRIPTION || DEFAULT_SITE_SETTINGS.site_description,
    homepage_title: env.HOMEPAGE_TITLE || DEFAULT_SITE_SETTINGS.homepage_title,
    homepage_description:
      env.HOMEPAGE_DESCRIPTION || DEFAULT_SITE_SETTINGS.homepage_description,
  };

  for (const [key, value] of Object.entries(defaults)) {
    await db
      .prepare(
        `
      INSERT INTO site_settings (setting_key, setting_value)
      VALUES (?, ?)
      ON CONFLICT(setting_key) DO NOTHING
    `,
      )
      .bind(key, value)
      .run();
  }
}

async function migrateLegacySiteSettingsDefaults(db) {
  for (const migration of LEGACY_SITE_SETTING_MIGRATIONS) {
    await db
      .prepare(
        `
      UPDATE site_settings
      SET setting_value = ?, updated_at = CURRENT_TIMESTAMP
      WHERE setting_key = ? AND setting_value = ?
    `,
      )
      .bind(migration.to, migration.key, migration.from)
      .run();
  }
}

async function removeObsoleteSiteSettings(db) {
  const placeholders = OBSOLETE_SITE_SETTING_KEYS.map(() => "?").join(", ");
  await db
    .prepare(
      `
    DELETE FROM site_settings
    WHERE setting_key IN (${placeholders})
  `,
    )
    .bind(...OBSOLETE_SITE_SETTING_KEYS)
    .run();
}

async function insertDefaultData(db) {
  const installationStatus = await getInstallationStatus(db);
  if (!installationStatus.setupRequired) {
    return;
  }
}

async function insertProductionBootstrapData(db, options) {
  const password = `${options.adminPassword || ""}`.trim();
  const adminEmail = normalizeOptionalString(options.adminEmail);
  const passwordError = validatePassword(password);
  const emailError = validateEmail(adminEmail);

  if (passwordError) {
    throw new Error(
      `生产环境初始化失败：${passwordError}。请在安装向导中设置有效管理员密码。`,
    );
  }

  if (emailError) {
    throw new Error(
      `生产环境初始化失败：${emailError}。管理员邮箱如填写则必须合法。`,
    );
  }

  const adminHash = await bcrypt.hash(password, 10);
  const adminResult = await db
    .prepare(
      `
    INSERT INTO users (username, email, password_hash, role, real_name)
    VALUES (?, ?, ?, ?, ?)
  `,
    )
    .bind(
      options.adminUsername,
      adminEmail,
      adminHash,
      "admin",
      options.adminRealName,
    )
    .run();

  const adminUserId = Number(adminResult.meta.last_row_id);

  try {
    await db
      .prepare(
        `
      UPDATE site_settings
      SET updated_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE setting_key IN ('site_name', 'homepage_title')
    `,
      )
      .bind(adminUserId)
      .run();
  } catch (error) {
    console.warn("Update site settings owner during install error:", error);
  }

  return adminUserId;
}
