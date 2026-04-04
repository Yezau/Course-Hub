import { defineStore } from "pinia";
import { computed, ref } from "vue";
import api from "@/utils/api";

const PUBLIC_SITE_SETTINGS_CACHE_KEY = "course-hub:public-site-settings";

function readCachedPublicSettings() {
  try {
    const rawCachedValue = localStorage.getItem(PUBLIC_SITE_SETTINGS_CACHE_KEY);
    if (!rawCachedValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawCachedValue);
    return parsedValue && typeof parsedValue === "object" ? parsedValue : null;
  } catch (error) {
    return null;
  }
}

function writeCachedPublicSettings(settings = {}) {
  try {
    localStorage.setItem(
      PUBLIC_SITE_SETTINGS_CACHE_KEY,
      JSON.stringify(settings || {}),
    );
  } catch (error) {
    // Ignore storage failures and keep UI usable.
  }
}

export const defaultSiteSettings = {
  site_name: "",
  site_description: "集中管理课程资料、作业与讨论内容。",
  site_logo_text: "课",
  site_logo_url: "",
  homepage_title: "在线课程学习平台",
  homepage_description: "提供资料分发、作业管理与课程讨论等完整功能。",
  homepage_primary_label: "立即使用",
  homepage_secondary_label: "已有账号登录",
  login_title: "登录",
  login_description: "使用账号或学号进入课程后台",
  register_title: "注册",
  register_description: "创建属于你的课程账号",
  registration_enabled: "1",
  allowed_origins: "",
  storage_quota_mb: "10240",
};

export function isSettingEnabled(value, fallback = false) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(`${value}`.trim().toLowerCase());
}

export const useSiteSettingsStore = defineStore("site-settings", () => {
  const publicSettings = ref({ ...defaultSiteSettings });
  const adminSettings = ref({ ...defaultSiteSettings });
  const hasLoadedPublic = ref(false);
  const isLoadingPublic = ref(false);
  const publicLoadError = ref("");

  async function loadPublicSettings(force = false) {
    if (hasLoadedPublic.value && !force) {
      return publicSettings.value;
    }

    if (isLoadingPublic.value && !force) {
      return publicSettings.value;
    }

    isLoadingPublic.value = true;

    try {
      const response = await api.get("/settings/public", { timeout: 4000 });
      const mergedSettings = {
        ...defaultSiteSettings,
        ...(response.settings || {}),
      };

      publicSettings.value = mergedSettings;
      writeCachedPublicSettings(mergedSettings);
      publicLoadError.value = "";
    } catch (error) {
      // Keep current UI state (including cached settings) when endpoint is degraded.
      publicLoadError.value = `${error?.message || "加载公共配置失败"}`;
    } finally {
      hasLoadedPublic.value = true;
      isLoadingPublic.value = false;
    }

    return publicSettings.value;
  }

  async function loadAdminSettings() {
    const response = await api.get("/settings");
    const mergedSettings = {
      ...defaultSiteSettings,
      ...(response.settings || {}),
    };

    adminSettings.value = mergedSettings;
    publicSettings.value = mergedSettings;
    writeCachedPublicSettings(mergedSettings);
    hasLoadedPublic.value = true;

    return mergedSettings;
  }

  async function saveAdminSettings(settings) {
    const response = await api.put("/settings", { settings });
    const mergedSettings = {
      ...defaultSiteSettings,
      ...(response.settings || {}),
    };

    adminSettings.value = mergedSettings;
    publicSettings.value = mergedSettings;
    writeCachedPublicSettings(mergedSettings);
    hasLoadedPublic.value = true;

    return response;
  }

  const brandName = computed(
    () => `${publicSettings.value.site_name || ""}`.trim() || "课程平台",
  );
  const registrationEnabled = computed(() =>
    isSettingEnabled(publicSettings.value.registration_enabled, true),
  );
  const canShowRegisterEntry = computed(() => registrationEnabled.value);

  return {
    publicSettings,
    adminSettings,
    hasLoadedPublic,
    isLoadingPublic,
    publicLoadError,
    brandName,
    registrationEnabled,
    canShowRegisterEntry,
    loadPublicSettings,
    loadAdminSettings,
    saveAdminSettings,
  };
});
