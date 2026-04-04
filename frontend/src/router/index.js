import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useInstallStore } from "@/stores/install";
import { useSiteSettingsStore } from "@/stores/siteSettings";

const routes = [
  {
    path: "/",
    name: "Landing",
    component: () => import("@/views/LandingView.vue"),
    meta: { pageTitle: "首页" },
  },
  {
    path: "/dashboard",
    name: "Dashboard",
    component: () => import("@/views/HomeView.vue"),
    meta: { requiresAuth: true, pageTitle: "仪表盘" },
  },
  {
    path: "/login",
    name: "Login",
    component: () => import("@/views/auth/LoginView.vue"),
    meta: { requiresGuest: true, pageTitle: "登录" },
  },
  {
    path: "/register",
    name: "Register",
    component: () => import("@/views/auth/RegisterView.vue"),
    meta: { requiresGuest: true, pageTitle: "注册" },
  },
  {
    path: "/install",
    name: "InstallSetup",
    component: () => import("@/views/setup/InstallSetupView.vue"),
    meta: { pageTitle: "首次安装" },
  },
  {
    path: "/materials",
    name: "Materials",
    component: () => import("@/views/materials/MaterialsView.vue"),
    meta: { requiresAuth: true, pageTitle: "课件资料" },
  },
  {
    path: "/materials/:id",
    redirect: "/materials",
  },
  {
    path: "/assignments",
    name: "Assignments",
    component: () => import("@/views/assignments/AssignmentsView.vue"),
    meta: { requiresAuth: true, pageTitle: "作业管理" },
  },
  {
    path: "/assignments/:id",
    name: "AssignmentDetail",
    component: () => import("@/views/assignments/AssignmentDetailView.vue"),
    meta: { requiresAuth: true, pageTitle: "作业详情" },
  },
  {
    path: "/posts",
    name: "Posts",
    component: () => import("@/views/posts/PostsView.vue"),
    meta: { requiresAuth: true, pageTitle: "讨论区" },
  },
  {
    path: "/posts/:id",
    name: "PostDetail",
    component: () => import("@/views/posts/PostDetailView.vue"),
    meta: { requiresAuth: true, pageTitle: "讨论详情" },
  },
  {
    path: "/notifications",
    name: "Notifications",
    component: () => import("@/views/notifications/NotificationsView.vue"),
    meta: { requiresAuth: true, pageTitle: "通知中心" },
  },
  {
    path: "/profile",
    name: "Profile",
    component: () => import("@/views/ProfileView.vue"),
    meta: { requiresAuth: true, pageTitle: "个人信息" },
  },
  {
    path: "/admin/users",
    name: "UserManagement",
    component: () => import("@/views/admin/UserManagementView.vue"),
    meta: {
      requiresAuth: true,
      requiresUserManager: true,
      pageTitle: "用户管理",
    },
  },
  {
    path: "/admin/users/new",
    name: "UserCreate",
    component: () => import("@/views/admin/UserFormView.vue"),
    meta: {
      requiresAuth: true,
      requiresUserManager: true,
      pageTitle: "新建账号",
    },
  },
  {
    path: "/admin/users/batch",
    name: "UserBatchCreate",
    component: () => import("@/views/admin/UserBatchCreateView.vue"),
    meta: {
      requiresAuth: true,
      requiresUserManager: true,
      pageTitle: "批量建号",
    },
  },
  {
    path: "/admin/users/:id/edit",
    name: "UserEdit",
    component: () => import("@/views/admin/UserFormView.vue"),
    meta: {
      requiresAuth: true,
      requiresUserManager: true,
      pageTitle: "编辑账号",
    },
  },
  {
    path: "/admin/settings",
    name: "SiteSettings",
    component: () => import("@/views/admin/SiteSettingsView.vue"),
    meta: { requiresAuth: true, requiresAdmin: true, pageTitle: "站点设置" },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

const DYNAMIC_IMPORT_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|Failed to load module script|Importing a module script failed/i;
const DYNAMIC_IMPORT_RELOAD_MARKER_KEY =
  "course-hub:dynamic-import-reload-marker";
const DYNAMIC_IMPORT_RELOAD_MARKER_TTL_MS = 2 * 60 * 1000;

let hasRetriedDynamicImport = false;

function resolveSafeRedirectPath(rawTarget, fallback = "/dashboard") {
  if (typeof rawTarget !== "string") {
    return fallback;
  }

  const normalized = rawTarget.trim();
  if (!normalized.startsWith("/") || normalized.startsWith("//")) {
    return fallback;
  }

  return normalized;
}

function hasRecentDynamicImportReloadMarker() {
  try {
    const rawMarker = sessionStorage.getItem(DYNAMIC_IMPORT_RELOAD_MARKER_KEY);
    const markerTimestamp = Number.parseInt(rawMarker || "", 10);

    if (!Number.isFinite(markerTimestamp)) {
      return false;
    }

    const isExpired =
      Date.now() - markerTimestamp > DYNAMIC_IMPORT_RELOAD_MARKER_TTL_MS;
    if (isExpired) {
      sessionStorage.removeItem(DYNAMIC_IMPORT_RELOAD_MARKER_KEY);
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
}

function markDynamicImportReloadAttempt() {
  try {
    sessionStorage.setItem(DYNAMIC_IMPORT_RELOAD_MARKER_KEY, `${Date.now()}`);
  } catch (error) {
    // Ignore storage failures and keep fallback best-effort.
  }
}

router.onError((error, to) => {
  const message = `${error?.message || error || ""}`;
  if (!DYNAMIC_IMPORT_ERROR_PATTERN.test(message)) {
    return;
  }

  if (hasRetriedDynamicImport || hasRecentDynamicImportReloadMarker()) {
    return;
  }

  hasRetriedDynamicImport = true;
  markDynamicImportReloadAttempt();

  const targetPath =
    typeof to?.fullPath === "string" && to.fullPath
      ? to.fullPath
      : `${window.location.pathname}${window.location.search || ""}`;
  const separator = targetPath.includes("?") ? "&" : "?";
  const fallbackUrl = `${targetPath}${separator}reload=${Date.now()}`;

  window.location.replace(fallbackUrl);
});

router.afterEach(() => {
  try {
    sessionStorage.removeItem(DYNAMIC_IMPORT_RELOAD_MARKER_KEY);
  } catch (error) {
    // Ignore storage failures and keep navigation unaffected.
  }

  hasRetriedDynamicImport = false;
});

router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore();
  const installStore = useInstallStore();
  const siteSettingsStore = useSiteSettingsStore();

  if (!installStore.hasChecked || !installStore.statusKnown) {
    await installStore.checkStatus().catch(() => false);
  }

  if (installStore.statusKnown && installStore.setupRequired) {
    if (authStore.isAuthenticated) {
      authStore.logout();
    }

    if (to.name !== "InstallSetup") {
      next("/install");
      return;
    }

    next();
    return;
  } else if (installStore.statusKnown && to.name === "InstallSetup") {
    next(authStore.isAuthenticated ? "/dashboard" : "/login");
    return;
  }

  if (
    ["Landing", "Login", "Register"].includes(to.name) &&
    !siteSettingsStore.hasLoadedPublic
  ) {
    siteSettingsStore.loadPublicSettings().catch(() => null);
  }

  if (authStore.isAuthenticated && !authStore.user) {
    await authStore.checkAuth();
  }

  if (to.path === "/" && authStore.isAuthenticated) {
    next("/dashboard");
    return;
  }

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next({
      path: "/login",
      query: {
        redirect: to.fullPath || "/dashboard",
      },
    });
    return;
  }

  if (to.meta.requiresAdmin && !authStore.isAdmin) {
    next("/dashboard");
    return;
  }

  if (to.meta.requiresUserManager && !authStore.isTeacher) {
    next("/dashboard");
    return;
  }

  if (to.meta.requiresGuest && authStore.isAuthenticated) {
    next(resolveSafeRedirectPath(to.query?.redirect, "/dashboard"));
    return;
  }

  if (to.name === "Register" && !siteSettingsStore.registrationEnabled) {
    next("/login");
    return;
  }

  next();
});

export default router;
