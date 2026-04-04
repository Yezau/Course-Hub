import { computed, ref } from "vue";

const THEME_STORAGE_KEY = "course-hub:theme-mode";
const ALLOWED_THEME_MODES = new Set(["system", "light", "dark"]);
const MEDIA_QUERY = "(prefers-color-scheme: dark)";

const themeMode = ref("system");
const effectiveTheme = ref("light");

let initialized = false;
let darkModeMediaQuery = null;

function resolveSystemTheme() {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return "light";
  }

  return window.matchMedia(MEDIA_QUERY).matches ? "dark" : "light";
}

function normalizeThemeMode(value) {
  const normalized = `${value || ""}`.trim().toLowerCase();
  return ALLOWED_THEME_MODES.has(normalized) ? normalized : "system";
}

function readStoredThemeMode() {
  if (typeof window === "undefined") {
    return "system";
  }

  try {
    return normalizeThemeMode(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch (error) {
    return "system";
  }
}

function writeStoredThemeMode(value) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, normalizeThemeMode(value));
  } catch (error) {
    // Ignore storage failures and keep theme switch usable.
  }
}

function applyThemeToDocument(theme) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
}

function refreshEffectiveTheme() {
  const nextTheme =
    themeMode.value === "system" ? resolveSystemTheme() : themeMode.value;
  effectiveTheme.value = nextTheme;
  applyThemeToDocument(nextTheme);
}

function handleSystemThemeChange() {
  if (themeMode.value === "system") {
    refreshEffectiveTheme();
  }
}

export function initThemeMode() {
  if (initialized) {
    return;
  }

  initialized = true;
  themeMode.value = readStoredThemeMode();

  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
  ) {
    darkModeMediaQuery = window.matchMedia(MEDIA_QUERY);
    darkModeMediaQuery.addEventListener("change", handleSystemThemeChange);
  }

  refreshEffectiveTheme();
}

export function setThemeMode(nextMode) {
  const normalizedMode = normalizeThemeMode(nextMode);
  themeMode.value = normalizedMode;
  writeStoredThemeMode(normalizedMode);
  refreshEffectiveTheme();
}

export function toggleThemeMode() {
  setThemeMode(effectiveTheme.value === "dark" ? "light" : "dark");
}

export function useThemeMode() {
  initThemeMode();

  return {
    themeMode,
    effectiveTheme,
    isDarkTheme: computed(() => effectiveTheme.value === "dark"),
    setThemeMode,
    toggleThemeMode,
  };
}
