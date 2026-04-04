<template>
    <div ref="dropdownRef" class="relative z-50">
        <button type="button" @click="toggleNotifications"
            class="relative rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2">
            <span class="sr-only">查看通知</span>
            <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round"
                    d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
            <span v-if="notificationsStore.unreadCount > 0"
                class="absolute -right-0.5 -top-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-white">
                {{ badgeText }}
            </span>
        </button>

        <div v-if="isOpen"
            class="absolute right-0 mt-2 w-80 origin-top-right rounded-xl bg-white shadow-lg ring-1 ring-slate-200 focus:outline-none sm:w-96">
            <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <h3 class="text-sm font-semibold text-slate-900">
                    通知栏 <span class="ml-1 text-xs font-normal text-slate-500">({{ notificationsStore.unreadCount }}
                        未读)</span>
                </h3>
                <button v-if="notificationsStore.unreadCount > 0" @click="markAllAsRead"
                    class="text-xs font-medium text-blue-600 hover:text-blue-700">
                    全部设为已读
                </button>
            </div>

            <div class="max-h-[60vh] overflow-y-auto overscroll-contain">
                <div v-if="notificationsStore.notifications.length === 0"
                    class="py-8 text-center text-sm text-slate-500">
                    暂无通知
                </div>
                <div v-else class="divide-y divide-slate-100">
                    <button v-for="notification in notificationsStore.notifications" :key="notification.id"
                        @click="handleNotificationClick(notification)"
                        class="flex w-full items-start gap-3 p-4 text-left transition hover:bg-slate-50"
                        :class="notification.is_read ? 'opacity-75' : 'bg-blue-50/40'">
                        <div v-if="notification.actor_avatar"
                            class="h-8 w-8 shrink-0 overflow-hidden rounded-full ring-1 ring-slate-200">
                            <img :src="resolveAssetUrl(notification.actor_avatar)" class="h-full w-full object-cover">
                        </div>
                        <div v-else
                            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                            {{ notification.actor_name ? notification.actor_name.charAt(0).toUpperCase() : 'U' }}
                        </div>
                        <div class="min-w-0 flex-1">
                            <p class="text-sm break-words line-clamp-2"
                                :class="notification.is_read ? 'text-slate-600' : 'font-medium text-slate-900'"
                                v-text="notification.message"></p>
                            <p class="mt-1 text-[11px] text-slate-400 font-medium">
                                {{ formatDate(notification.created_at) }}
                            </p>
                        </div>
                        <div v-if="!notification.is_read" class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500">
                        </div>
                    </button>
                </div>
            </div>

            <div class="border-t border-slate-100 px-4 py-2">
                <button type="button" @click="goToNotificationsPage"
                    class="w-full rounded-lg px-3 py-2 text-center text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900">
                    查看全部通知
                </button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useNotificationsStore } from '@/stores/notifications'
import { resolveAssetUrl } from '@/utils/api'

const MAX_BADGE_COUNT = 99

const router = useRouter()
const notificationsStore = useNotificationsStore()
const isOpen = ref(false)
const dropdownRef = ref(null)

const badgeText = computed(() => {
    const count = notificationsStore.unreadCount
    return count > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : `${count}`
})

function toggleNotifications() {
    isOpen.value = !isOpen.value
    if (isOpen.value) {
        notificationsStore.fetchNotifications({ limit: 20, offset: 0, append: false })
    }
}

async function markAllAsRead() {
    await notificationsStore.markAllAsRead()
}

async function handleNotificationClick(notification) {
    if (!notification.is_read) {
        await notificationsStore.markAsRead(notification.id)
    }
    isOpen.value = false

    if (notification.type === 'assignment_new') {
        router.push(`/assignments/${notification.source_id}`)
    } else if (notification.type === 'post_reply' || notification.type === 'mention') {
        router.push(`/posts/${notification.source_id}`)
    }
}

function goToNotificationsPage() {
    isOpen.value = false
    router.push('/notifications')
}

function formatDate(dateStr) {
    if (!dateStr) return ''
    const date = new Date(dateStr + 'Z')
    return date.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function handleClickOutside(event) {
    const target = event.target
    if (isOpen.value && dropdownRef.value && target instanceof Node && !dropdownRef.value.contains(target)) {
        isOpen.value = false
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