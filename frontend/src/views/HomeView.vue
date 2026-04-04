<template>
  <AppShell title="仪表盘" :title-tooltip="dashboardTooltip">
    <div class="mx-auto max-w-5xl ui-stack">
      <section class="ui-surface">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <h2 class="text-xl font-semibold text-slate-950">{{ dashboardHeading }}</h2>

          <div class="flex flex-wrap gap-2 text-sm text-slate-500">
            <span class="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">{{ roleLabel }}</span>
            <span class="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">{{ todayLabel }}</span>
          </div>
        </div>

        <p v-if="loadError"
          class="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {{ loadError }}
        </p>

        <div class="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article v-for="item in statCards" :key="item.label" class="ui-card">
            <div class="flex items-center gap-2">
              <p class="text-sm font-medium text-slate-500">{{ item.label }}</p>
              <InfoTooltip :text="item.tooltip" />
            </div>
            <p class="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{{ item.value }}</p>
          </article>
        </div>

        <div v-if="showStorageSection" class="mt-6 border-t border-slate-200 pt-6">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div class="flex items-center gap-2">
              <h3 class="text-base font-semibold text-slate-950">资源容量</h3>
              <InfoTooltip text="已统计课件、作业附件、提交附件、讨论区图片、头像和站点标识等文件占用。" />
            </div>
            <p class="text-sm font-medium text-slate-500">{{ storagePercentLabel }}</p>
          </div>

          <p class="mt-4 text-lg font-semibold text-slate-950">
            {{ formatStorage(storageUsedBytes) }} / {{ formatStorage(storageQuotaBytes) }}
          </p>

          <div class="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
            <div class="h-full rounded-full bg-slate-900 transition-all duration-500"
              :style="{ width: `${storagePercent}%` }" />
          </div>
        </div>
      </section>
    </div>
  </AppShell>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import AppShell from '@/components/AppShell.vue'
import InfoTooltip from '@/components/InfoTooltip.vue'
import { useAuthStore } from '@/stores/auth'
import api from '@/utils/api'

const DEFAULT_STORAGE_QUOTA_BYTES = 10 * 1024 * 1024 * 1024

const authStore = useAuthStore()

const isLoading = ref(false)
const loadError = ref('')
const dashboard = ref(createDefaultDashboard())

function createDefaultDashboard() {
  return {
    stats: {
      materials: 0,
      assignments: 0,
      posts: 0,
      submissions: 0
    },
    storage: null
  }
}

const roleLabel = computed(() => {
  if (authStore.isAdmin) return '管理员'
  if (authStore.isTeacher) return '教师'
  return '学生'
})

const dashboardHeading = computed(() => (
  `${getGreeting()}，${authStore.user?.real_name || authStore.user?.username || '欢迎回来'}`
))

const dashboardTooltip = computed(() => {
  if (authStore.isAdmin) {
    return '这里汇总课程资料、作业、讨论和整体资源占用，便于统一巡检当前站点状态。'
  }

  if (authStore.isTeacher) {
    return '这里汇总教学资源、作业提交和课程讨论的整体情况，便于安排发布、批改和答疑。'
  }

  return '这里展示你当前可见的课件、作业和讨论区概览，便于快速进入本周学习任务。'
})

const todayLabel = computed(() => new Intl.DateTimeFormat('zh-CN', {
  month: 'long',
  day: 'numeric',
  weekday: 'long'
}).format(new Date()))

const statCards = computed(() => {
  const stats = dashboard.value.stats

  return [
    {
      label: '课程资料',
      value: isLoading.value ? '--' : stats.materials,
      tooltip: '当前站点内已收录的课件与资料总数。'
    },
    {
      label: '作业任务',
      value: isLoading.value ? '--' : stats.assignments,
      tooltip: authStore.isTeacher
        ? '当前已发布的作业总数。'
        : '你当前可以查看的作业总数。'
    },
    {
      label: '讨论主题',
      value: isLoading.value ? '--' : stats.posts,
      tooltip: '讨论区中已创建的主题总数。'
    },
    {
      label: authStore.isStudent ? '已提交作业' : '收到提交',
      value: isLoading.value ? '--' : stats.submissions,
      tooltip: authStore.isStudent
        ? '按当前账号统计的个人作业提交次数。'
        : '按全站作业统计的提交总次数。'
    }
  ]
})

const showStorageSection = computed(() => !authStore.isStudent && Boolean(dashboard.value.storage))

const storageUsedBytes = computed(() => dashboard.value.storage?.used_bytes || 0)

const storageQuotaBytes = computed(() => (
  dashboard.value.storage?.quota_bytes || DEFAULT_STORAGE_QUOTA_BYTES
))

const storagePercent = computed(() => {
  if (!storageQuotaBytes.value) {
    return 0
  }

  const ratio = (storageUsedBytes.value / storageQuotaBytes.value) * 100
  if (!Number.isFinite(ratio)) {
    return 0
  }

  return Math.min(100, Math.max(0, Number(ratio.toFixed(1))))
})

const storagePercentLabel = computed(() => `${storagePercent.value}% 已使用`)

function getGreeting() {
  const hour = new Date().getHours()

  if (hour < 12) return '上午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

async function loadDashboard() {
  if (!authStore.user?.id) {
    dashboard.value = createDefaultDashboard()
    loadError.value = ''
    return
  }

  isLoading.value = true
  loadError.value = ''

  try {
    const response = await api.get('/dashboard')

    dashboard.value = {
      stats: {
        ...createDefaultDashboard().stats,
        ...(response?.stats || {})
      },
      storage: response?.storage || null
    }
  } catch (error) {
    console.error('加载仪表盘失败:', error)
    dashboard.value = createDefaultDashboard()
    loadError.value = error?.error || error?.message || '仪表盘数据加载失败，请稍后重试。'
  } finally {
    isLoading.value = false
  }
}

function formatStorage(bytes) {
  if (!bytes) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  )
  const value = bytes / (1024 ** exponent)
  const fractionDigits = value >= 10 || exponent === 0 ? 0 : 1

  return `${value.toFixed(fractionDigits)} ${units[exponent]}`
}

watch(
  () => [authStore.user?.id, authStore.user?.role],
  () => {
    loadDashboard()
  },
  { immediate: true }
)
</script>
