import axios from "axios";
import { useAuthStore } from "@/stores/auth";

const parsedApiTimeout = Number.parseInt(
  import.meta.env.VITE_API_TIMEOUT_MS || "",
  10,
);
const API_TIMEOUT_MS =
  Number.isFinite(parsedApiTimeout) && parsedApiTimeout > 0
    ? parsedApiTimeout
    : 30000;

const rawBaseUrl = `${import.meta.env.VITE_API_BASE_URL || "/api"}`.trim();
export const API_BASE_URL = rawBaseUrl.endsWith("/")
  ? rawBaseUrl.slice(0, -1)
  : rawBaseUrl;

export function resolveApiUrl(path = "") {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

export function resolveAssetUrl(path = "") {
  const normalizedPath = `${path || ""}`.trim();

  if (!normalizedPath) {
    return "";
  }

  if (/^(https?:|blob:|data:)/i.test(normalizedPath)) {
    return normalizedPath;
  }

  const apiRelativePath = normalizedPath.startsWith("/api/")
    ? normalizedPath.slice(4) || "/"
    : normalizedPath;

  return resolveApiUrl(apiRelativePath);
}

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT_MS,
  headers: {
    "Content-Type": "application/json",
  },
});

function shouldHandleUnauthorized(error, authStore) {
  if (error.response?.status !== 401) {
    return false;
  }

  if (!authStore.token) {
    return false;
  }

  const requestUrl = error.config?.url || "";
  return (
    !requestUrl.includes("/auth/login") &&
    !requestUrl.includes("/auth/register")
  );
}

api.interceptors.request.use(
  (config) => {
    const authStore = useAuthStore();
    if (authStore.token) {
      config.headers.Authorization = `Bearer ${authStore.token}`;
    }

    if (config.data instanceof FormData) {
      delete config.headers["Content-Type"];
    }

    return config;
  },
  (error) => Promise.reject(error),
);

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const authStore = useAuthStore();

    if (error.response) {
      if (shouldHandleUnauthorized(error, authStore)) {
        authStore.logout();
        window.location.href = "/login";
      }

      return Promise.reject(error.response.data);
    }

    return Promise.reject(error);
  },
);

export default api;
