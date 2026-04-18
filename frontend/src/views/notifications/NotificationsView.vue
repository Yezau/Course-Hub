<template>
    <AppShell title="通知中心" description="查看所有通知并快速跳转到对应的作业或讨论内容。">
        <div class="mx-auto max-w-4xl ui-stack">
            <section class="ui-surface">
                <div class="flex flex-wrap items-center justify-between gap-3">
                    <p class="text-sm text-slate-500">
                        当前未读
                        <span class="font-semibold text-slate-900">{{ notificationsStore.unreadCount }}</span>
                        条
                    </p>

                    <div class="flex flex-wrap items-center gap-2">
                        <button type="button"
                            class="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                            :disabled="loading || loadingMore" @click="reloadNotifications">
                            刷新
                        </button>
                        <button type="button"
                            class="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                            :disabled="notificationsStore.unreadCount === 0 || loading" @click="markAllAsRead">
                            全部设为已读
                        </button>
                    </div>
                </div>

                <div v-if="loading"
                    class="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    通知加载中...
                </div>

                <div v-else-if="notificationsStore.notifications.length === 0"
                    class="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                    暂无通知
                </div>

                <div v-else
                    class="mt-5 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100 bg-white">
                    <div v-for="notification in notificationsStore.notifications" :key="notification.id"
                        class="flex items-start gap-3 p-4"
                        :class="notification.is_read ? 'opacity-75' : 'bg-blue-50/40'">
                        <button type="button" class="flex min-w-0 flex-1 items-start gap-3 text-left"
                            @click="openNotification(notification)">
                            <div v-if="notification.actor_avatar"
                                class="h-9 w-9 shrink-0 overflow-hidden rounded-full ring-1 ring-slate-200">
                                <img :src="notification.actor_avatar" class="h-full w-full object-cover" alt="avatar" />
                            </div>
                            <div v-else
                                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                                {{ notification.actor_name ? notification.actor_name.charAt(0).toUpperCase() : 'U' }}
                            </div>

                            <div class="min-w-0 flex-1">
                                <p class="break-words text-sm"
                                    :class="notification.is_read ? 'text-slate-600' : 'font-medium text-slate-900'">
                                    {{ notification.message }}
                                </p>
                                <p class="mt-1 text-[11px] font-medium text-slate-400">
                                    {{ formatDate(notification.created_at) }}
                                </p>
                            </div>
                        </button>

                        <button v-if="!notification.is_read" type="button"
                            class="shrink-0 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                            @click="markAsReadOnly(notification)">
                            标记已读
                        </button>
                    </div>
                </div>

                <div v-if="notificationsStore.notifications.length > 0" class="mt-4 flex items-center justify-center">
                    <button v-if="hasMore" type="button"
                        class="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                        :disabled="loadingMore" @click="loadMore">
                        {{ loadingMore ? '加载中...' : '加载更多' }}
                    </button>
                    <p v-else class="text-xs text-slate-400">已显示全部通知</p>
                </div>
            </section>
        </div>
    </AppShell>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import { useNotificationsStore } from '@/stores/notifications'
import { formatUtc8MonthDayTime } from '@/utils/dateTime'

const PAGE_SIZE = 20

const router = useRouter()
const notificationsStore = useNotificationsStore()

const loading = ref(false)
const loadingMore = ref(false)
const hasMore = ref(true)

function formatDate(dateStr) {
    return formatUtc8MonthDayTime(dateStr, '')
}

function resolveTargetPath(notification) {
    if (notification.type === 'assignment_new') {
        return `/assignments/${notification.source_id}`
    }

    if (notification.type === 'post_reply' || notification.type === 'mention') {
        return `/posts/${notification.source_id}`
    }

    return '/dashboard'
}

async function reloadNotifications() {
    loading.value = true
    await notificationsStore.fetchUnreadCount()
    const rows = await notificationsStore.fetchNotifications({
        limit: PAGE_SIZE,
        offset: 0,
        append: false
    })
    hasMore.value = rows.length === PAGE_SIZE
    loading.value = false
}

async function loadMore() {
    if (!hasMore.value || loadingMore.value) {
        return
    }

    loadingMore.value = true
    const rows = await notificationsStore.fetchNotifications({
        limit: PAGE_SIZE,
        offset: notificationsStore.notifications.length,
        append: true
    })
    hasMore.value = rows.length === PAGE_SIZE
    loadingMore.value = false
}

async function markAsReadOnly(notification) {
    if (notification.is_read) {
        return
    }

    const success = await notificationsStore.markAsRead(notification.id, { refreshList: false })
    if (success) {
        notification.is_read = 1
    }
}

async function markAllAsRead() {
    const success = await notificationsStore.markAllAsRead({ refreshList: false })
    if (success) {
        notificationsStore.notifications.forEach((item) => {
            item.is_read = 1
        })
    }
}

async function openNotification(notification) {
    await markAsReadOnly(notification)
    router.push(resolveTargetPath(notification))
}

onMounted(async () => {
    await reloadNotifications()
})
</script>
