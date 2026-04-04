import { defineStore } from "pinia";
import { ref } from "vue";
import api from "@/utils/api";

const INSTALL_COMPLETE_FLAG = "course-hub:install-complete";
const INSTALL_STATUS_CHECKED_BUILD_FLAG =
  "course-hub:install-status-checked-build";
const CURRENT_BUILD_ID =
  typeof __APP_BUILD_ID__ !== "undefined"
    ? `${__APP_BUILD_ID__ || ""}`.trim() || "local-dev"
    : "local-dev";

function safeStorageRead(readFn, fallback = "") {
  try {
    return readFn();
  } catch (error) {
    return fallback;
  }
}

function isInstallationMarkedCompleted() {
  return (
    safeStorageRead(() => localStorage.getItem(INSTALL_COMPLETE_FLAG), "") ===
    "1"
  );
}

function markInstallationCompleted(completed) {
  try {
    if (completed) {
      localStorage.setItem(INSTALL_COMPLETE_FLAG, "1");
      return;
    }

    localStorage.removeItem(INSTALL_COMPLETE_FLAG);
  } catch (error) {
    // Ignore storage failures and keep install flow usable.
  }
}

function getCheckedBuildId() {
  return `${
    safeStorageRead(
      () => localStorage.getItem(INSTALL_STATUS_CHECKED_BUILD_FLAG),
      "",
    ) || ""
  }`.trim();
}

function isInstallStatusCheckedForCurrentBuild() {
  return getCheckedBuildId() === CURRENT_BUILD_ID;
}

function markInstallStatusCheckedForCurrentBuild() {
  try {
    localStorage.setItem(INSTALL_STATUS_CHECKED_BUILD_FLAG, CURRENT_BUILD_ID);
  } catch (error) {
    // Ignore storage failures and keep install flow usable.
  }
}

export const useInstallStore = defineStore("install", () => {
  const locallyCompleted = isInstallationMarkedCompleted();
  const checkedForCurrentBuild = isInstallStatusCheckedForCurrentBuild();
  const setupRequired = ref(false);
  const hasChecked = ref(locallyCompleted && checkedForCurrentBuild);
  const isChecking = ref(false);
  const statusKnown = ref(locallyCompleted && checkedForCurrentBuild);
  const lastError = ref("");

  async function checkStatus(force = false) {
    const completedLocally = isInstallationMarkedCompleted();
    const checkedForCurrentBuildNow = isInstallStatusCheckedForCurrentBuild();

    if (!force && completedLocally && checkedForCurrentBuildNow) {
      setupRequired.value = false;
      hasChecked.value = true;
      statusKnown.value = true;
      lastError.value = "";
      return false;
    }

    if (hasChecked.value && !force) {
      return setupRequired.value;
    }

    isChecking.value = true;

    try {
      const response = await api.get("/install/status", { timeout: 60000 });
      setupRequired.value = Boolean(response?.setup_required);
      statusKnown.value = true;
      lastError.value =
        response?.available === false
          ? `${response?.error || "安装状态暂不可用"}`.trim()
          : "";

      markInstallationCompleted(!setupRequired.value);
      markInstallStatusCheckedForCurrentBuild();
    } catch (error) {
      const errorMessage = `${
        error?.error || error?.message || "无法获取安装状态"
      }`.trim();
      const errorCode = `${error?.code || ""}`.trim().toUpperCase();
      const isMissingDbBinding = errorMessage.includes("缺少 D1 数据库绑定 DB");
      const isStatusAuthProtected =
        errorCode === "AUTH_REQUIRED" || errorCode === "FORBIDDEN";

      if (isStatusAuthProtected) {
        setupRequired.value = false;
        statusKnown.value = true;
        lastError.value = "";
        markInstallationCompleted(true);
        markInstallStatusCheckedForCurrentBuild();
      } else if (Boolean(error?.setup_required) || isMissingDbBinding) {
        setupRequired.value = true;
        statusKnown.value = true;
        lastError.value = isMissingDbBinding
          ? "缺少 D1 数据库绑定 DB，请先在 Pages 项目 Settings > Bindings 中绑定 D1（名称必须为 DB）后刷新页面继续安装。"
          : errorMessage;
        markInstallationCompleted(false);
        markInstallStatusCheckedForCurrentBuild();
      } else if (completedLocally) {
        setupRequired.value = false;
        statusKnown.value = true;
        lastError.value = "";
        markInstallStatusCheckedForCurrentBuild();
      } else {
        // Unknown network or cold-start failures keep status unresolved to avoid false redirects.
        setupRequired.value = false;
        statusKnown.value = false;
        lastError.value = errorMessage;
      }
    } finally {
      hasChecked.value = true;
      isChecking.value = false;
    }

    return setupRequired.value;
  }

  function markCompletedLocally() {
    markInstallationCompleted(true);
    markInstallStatusCheckedForCurrentBuild();
    setupRequired.value = false;
    hasChecked.value = true;
    statusKnown.value = true;
    lastError.value = "";
  }

  return {
    setupRequired,
    hasChecked,
    isChecking,
    statusKnown,
    lastError,
    checkStatus,
    markCompletedLocally,
  };
});
