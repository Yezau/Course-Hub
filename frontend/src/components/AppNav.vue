<template>
  <nav class="sticky top-0 z-50 border-b border-zinc-200 bg-white/95 backdrop-blur">
    <div class="mx-auto flex min-h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
      <router-link to="/" class="flex min-w-0 shrink-0 items-center gap-3">
        <div
          class="flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-900 bg-zinc-900 text-sm font-semibold text-white">
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        </div>
        <div class="min-w-0">
          <p class="text-[11px] font-semibold uppercase tracking-[0.28em] text-zinc-400">Learning Hub</p>
          <h1 class="truncate text-sm font-semibold text-zinc-950 sm:text-base">{{ brandName }}</h1>
        </div>
      </router-link>

      <div class="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
        <router-link v-for="item in navItems" :key="item.to" :to="item.to"
          class="shrink-0 rounded-full px-4 py-2 text-sm font-medium transition"
          :class="isActive(item) ? 'bg-zinc-900 text-white' : 'border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900'">
          {{ item.label }}
        </router-link>
      </div>

      <div class="flex shrink-0 items-center gap-2 sm:gap-3">
        <!-- Notifications Bell -->
        <div class="relative">
          <button type="button" @click="toggleNotifications"
            class="relative rounded-full border border-transparent p-2 text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900">
            <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round"
                d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
            <span v-if="notificationsStore.unreadCount > 0"
              class="absolute right-1.5 top-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-red-500 ring-2 ring-white"></span>
          </button>

          <!-- Notifications Dropdown -->
          <div v-if="isNotificationsOpen"
            class="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-zinc-200 bg-white p-4 shadow-lg ring-1 ring-black ring-opacity-5 z-50 flex flex-col max-h-[80vh] overflow-y-auto">
            <div class="flex justify-between items-center mb-4">
              <h3 class="text-sm font-semibold text-zinc-900">通知 (<span class="text-zinc-500">{{
                notificationsStore.unreadCount }}未读</span>)</h3>
              <button v-if="notificationsStore.unreadCount > 0" @click="markAllAsRead"
                class="text-xs text-blue-600 hover:text-blue-800 font-medium">
                全部设为已读
              </button>
            </div>

            <div v-if="notificationsStore.notifications.length === 0" class="text-sm text-zinc-500 py-4 text-center">
              暂无通知
            </div>
            <div v-else class="flex flex-col gap-2">
              <div v-for="notification in notificationsStore.notifications" :key="notification.id"
                @click="handleNotificationClick(notification)"
                class="rounded-lg p-3 cursor-pointer transition hover:bg-zinc-50 border border-transparent"
                :class="notification.is_read ? 'opacity-60' : 'bg-blue-50/30 border-blue-100'">
                <div class="flex items-start gap-3">
                  <div v-if="notification.actor_avatar"
                    class="h-8 w-8 rounded-full overflow-hidden shrink-0 mt-1 ring-1 ring-zinc-200">
                    <img :src="notification.actor_avatar" class="h-full w-full object-cover">
                  </div>
                  <div v-else
                    class="h-8 w-8 rounded-full bg-zinc-200 flex items-center justify-center shrink-0 mt-1 text-xs font-medium text-zinc-600">
                    {{ notification.actor_name ? notification.actor_name.charAt(0).toUpperCase() : 'U' }}
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-xs text-zinc-800 break-words line-clamp-2"
                      :class="notification.is_read ? 'text-zinc-600' : 'font-medium'" v-text="notification.message"></p>
                    <p class="text-[10px] text-zinc-400 mt-1">{{ formatDate(notification.created_at) }}</p>
                  </div>
                  <div v-if="!notification.is_read" class="w-2 h-2 rounded-full bg-blue-500 shrink-0 self-center"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <router-link to="/profile"
          class="flex items-center gap-3 rounded-2xl border border-transparent px-2 py-1.5 transition hover:border-zinc-200 hover:bg-zinc-50">
          <div
            class="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-300 bg-zinc-100 text-sm font-semibold text-zinc-900">
            {{ userInitial }}
          </div>
          <div class="hidden text-left lg:block">
            <p class="text-sm font-medium text-zinc-900">{{ displayName }}</p>
            <p class="text-xs text-zinc-500">{{ roleLabel }}</p>
          </div>
        </router-link>

        <button type="button" @click="$emit('logout')"
          class="rounded-full border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 transition hover:border-zinc-300 hover:bg-zinc-900 hover:text-white">
          退出
        </button>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useNotificationsStore } from '../stores/notifications'
import { useSiteSettingsStore } from '@/stores/siteSettings'
import { formatUtc8MonthDayTime } from '@/utils/dateTime'

const props = defineProps({
  user: {
    type: Object,
    default: null
  }
})

defineEmits(['logout'])

const route = useRoute()
const router = useRouter()
const notificationsStore = useNotificationsStore()
const siteSettingsStore = useSiteSettingsStore()
const isNotificationsOpen = ref(false)

const navItems = [
  { to: '/dashboard', label: '仪表盘' },
  { to: '/materials', label: '课件资料', startsWith: true },
  { to: '/assignments', label: '作业管理', startsWith: true },
  { to: '/posts', label: '讨论区', startsWith: true }
]

const displayName = computed(() => props.user?.real_name || props.user?.username || '未命名用户')
const userInitial = computed(() => displayName.value.trim().charAt(0).toUpperCase() || 'U')
const roleLabel = computed(() => {
  if (props.user?.role === 'admin') return '管理员'
  if (props.user?.role === 'teacher') return '教师'
  if (props.user?.role === 'student') return '学生'
  return '访客'
})
const brandName = computed(() => siteSettingsStore.brandName)

function isActive(item) {
  return item.startsWith ? route.path.startsWith(item.to) : route.path === item.to
}

function toggleNotifications() {
  isNotificationsOpen.value = !isNotificationsOpen.value
  if (isNotificationsOpen.value) {
    notificationsStore.fetchNotifications()
  }
}

async function markAllAsRead() {
  await notificationsStore.markAllAsRead()
}

async function handleNotificationClick(notification) {
  if (!notification.is_read) {
    await notificationsStore.markAsRead(notification.id)
  }
  isNotificationsOpen.value = false

  if (notification.type === 'assignment_new') {
    router.push(`/assignments/${notification.source_id}`)
  } else if (notification.type === 'post_reply' || notification.type === 'mention') {
    router.push(`/posts/${notification.source_id}`)
  }
}

function formatDate(dateStr) {
  return formatUtc8MonthDayTime(dateStr, '')
}

// Close notifications dropdown when clicking outside
function handleClickOutside(event) {
  if (isNotificationsOpen.value && !event.target.closest('.relative')) {
    isNotificationsOpen.value = false
  }
}

onMounted(() => {
  notificationsStore.startPolling()
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  notificationsStore.stopPolling()
  document.removeEventListener('click', handleClickOutside)
})
</script>
