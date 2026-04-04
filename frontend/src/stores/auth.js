import { defineStore } from "pinia";
import { ref, computed } from "vue";
import api from "@/utils/api";

export const useAuthStore = defineStore("auth", () => {
  const token = ref(localStorage.getItem("token") || "");
  const user = ref(null);
  const isLoading = ref(false);

  const isAuthenticated = computed(() => !!token.value);
  const isAdmin = computed(() => user.value?.role === "admin");
  const isTeacher = computed(
    () => user.value?.role === "teacher" || user.value?.role === "admin",
  );
  const isStudent = computed(() => user.value?.role === "student");

  // 登录
  async function login(credentials) {
    isLoading.value = true;
    try {
      const response = await api.post("/auth/login", credentials, {
        timeout: 60000,
      });
      token.value = response.token;
      user.value = response.user;
      localStorage.setItem("token", response.token);
      return response;
    } finally {
      isLoading.value = false;
    }
  }

  // 注册
  async function register(userData) {
    isLoading.value = true;
    try {
      const response = await api.post("/auth/register", userData);
      return response;
    } finally {
      isLoading.value = false;
    }
  }

  // 登出
  function logout() {
    token.value = "";
    user.value = null;
    localStorage.removeItem("token");
  }

  // 检查认证状态
  async function checkAuth() {
    if (!token.value) return null;

    try {
      const response = await api.get("/auth/me");
      user.value = response.user;
      return response.user;
    } catch (error) {
      logout();
      return null;
    }
  }

  // 更新用户信息
  async function updateProfile(data) {
    const response = await api.put(`/users/${user.value.id}`, data);
    user.value = response.user;
    return response;
  }

  return {
    token,
    user,
    isLoading,
    isAuthenticated,
    isAdmin,
    isTeacher,
    isStudent,
    login,
    register,
    logout,
    checkAuth,
    updateProfile,
  };
});
