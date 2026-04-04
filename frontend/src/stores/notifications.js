import { defineStore } from "pinia";
import { ref } from "vue";
import api from "../utils/api";
import { useAuthStore } from "./auth";

export const useNotificationsStore = defineStore("notifications", () => {
  const notifications = ref([]);
  const unreadCount = ref(0);
  const authStore = useAuthStore();
  let intervalId = null;

  async function fetchNotifications(options = {}) {
    if (!authStore.isAuthenticated) {
      notifications.value = [];
      return [];
    }

    const { limit = 20, offset = 0, append = false } = options;

    try {
      const data = await api.get("/notifications", {
        params: { limit, offset },
      });
      const list = Array.isArray(data) ? data : [];
      notifications.value = append ? [...notifications.value, ...list] : list;
      return list;
    } catch (e) {
      console.error("Failed to fetch notifications", e);
      return [];
    }
  }

  async function fetchUnreadCount() {
    if (!authStore.isAuthenticated) {
      unreadCount.value = 0;
      return 0;
    }

    try {
      const data = await api.get("/notifications/unread-count");
      unreadCount.value = data.count || 0;
      return unreadCount.value;
    } catch (e) {
      console.error("Failed to fetch unread count", e);
      return unreadCount.value;
    }
  }

  async function markAsRead(id, options = {}) {
    const { refreshList = true } = options;

    try {
      await api.put(`/notifications/${id}/read`);
      await fetchUnreadCount();
      if (refreshList) {
        await fetchNotifications();
      }
      return true;
    } catch (e) {
      console.error("Failed to mark notification as read", e);
      return false;
    }
  }

  async function markAllAsRead(options = {}) {
    const { refreshList = true } = options;

    try {
      await api.put("/notifications/read-all");
      await fetchUnreadCount();
      if (refreshList) {
        await fetchNotifications();
      }
      return true;
    } catch (e) {
      console.error("Failed to mark all notifications as read", e);
      return false;
    }
  }

  function startPolling() {
    if (intervalId) return;
    fetchUnreadCount();
    // Poll every 30 seconds
    intervalId = setInterval(fetchUnreadCount, 30000);
  }

  function stopPolling() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  return {
    notifications,
    unreadCount,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
    startPolling,
    stopPolling,
  };
});
