<template>
  <AppShell title="用户管理">
    <template #header-actions>
      <button v-if="authStore.isTeacher && selectedUsersCount > 0" type="button"
        class="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
        :disabled="isBatchDeleting || deletingUserId !== null" @click="removeSelectedUsers">
        {{ isBatchDeleting ? '批量删除中...' : `批量删除（${selectedUsersCount}）` }}
      </button>
      <router-link v-if="authStore.isTeacher" to="/admin/users/new"
        class="rounded-xl bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-slate-800">
        新建账号
      </router-link>
      <router-link to="/admin/users/batch"
        class="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950">
        批量新建
      </router-link>
    </template>

    <div class="mx-auto max-w-[92rem] space-y-4">
      <section class="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div class="rounded-xl bg-slate-950 px-3.5 py-2.5 text-white">
            <div class="flex items-center gap-3">
              <span class="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-300">总账号数</span>
              <span class="text-xl font-semibold tracking-tight text-white">{{ overviewStats.total }}</span>
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            <div v-for="item in roleStats" :key="item.label"
              class="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <span class="h-2 w-2 rounded-full" :class="item.dotClass" />
              <span class="text-slate-500">{{ item.label }}</span>
              <span class="font-semibold text-slate-950">{{ item.value }}</span>
            </div>
          </div>
        </div>
      </section>

      <p v-if="pageNotice"
        class="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700">
        {{ pageNotice }}
      </p>

      <p v-if="pageError" class="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">
        {{ pageError }}
      </p>

      <section v-if="batchDeleteProgress.visible" class="rounded-xl border border-slate-200 bg-white px-3.5 py-3">
        <div class="flex items-center justify-between gap-3 text-xs text-slate-600">
          <span>批量删除进度：{{ batchDeleteProgress.processed }} / {{ batchDeleteProgress.total }}</span>
          <span>批次 {{ batchDeleteProgress.completedChunks }} / {{ batchDeleteProgress.totalChunks }}</span>
        </div>
        <div class="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div class="h-full rounded-full bg-rose-500 transition-all duration-300"
            :style="{ width: `${batchDeleteProgressPercent}%` }"></div>
        </div>
      </section>

      <section class="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <h2 class="text-base font-semibold text-slate-950">账号列表</h2>

          <div class="grid gap-2"
            :class="authStore.isAdmin ? 'sm:grid-cols-[minmax(240px,1fr),140px]' : 'sm:grid-cols-[minmax(240px,1fr)]'">
            <input v-model.trim="filters.keyword" type="text" placeholder="搜索用户名、姓名、邮箱或学号"
              class="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-950 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100" />
            <select v-if="authStore.isAdmin" v-model="filters.role"
              class="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm text-slate-950 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100">
              <option value="all">全部角色</option>
              <option value="admin">管理员</option>
              <option value="teacher">教师</option>
              <option value="student">学生</option>
            </select>
          </div>
        </div>

        <div v-if="isLoading"
          class="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
          正在加载用户列表...
        </div>
        <div v-else-if="filteredUsers.length === 0"
          class="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
          当前筛选条件下没有匹配的账号。
        </div>
        <div v-if="!isLoading && filteredUsers.length > 0"
          class="mt-4 overflow-hidden rounded-xl border border-slate-200">
          <div
            class="hidden bg-slate-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 lg:grid lg:grid-cols-[44px,minmax(0,2fr),110px,140px,160px,220px] lg:gap-3">
            <span class="flex items-center justify-center">
              <input v-if="authStore.isTeacher" type="checkbox"
                class="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                :checked="isAllCurrentPageSelected"
                :disabled="!selectablePageUsers.length || isBatchDeleting || deletingUserId !== null"
                @change="toggleSelectCurrentPage($event.target.checked)" />
            </span>
            <span>账号信息</span>
            <span>角色</span>
            <span>学号</span>
            <span>最近登录</span>
            <span>操作</span>
          </div>

          <article v-for="user in paginatedUsers" :key="user.id"
            class="border-t border-slate-200 px-3.5 py-3 first:border-t-0 lg:grid lg:grid-cols-[44px,minmax(0,2fr),110px,140px,160px,220px] lg:items-center lg:gap-3 lg:px-4">
            <div class="flex items-start gap-3 min-w-0 lg:contents">
              <div class="pt-0.5 lg:pt-0 lg:flex lg:items-center lg:justify-center">
                <input v-if="authStore.isTeacher" type="checkbox"
                  class="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                  :checked="isUserSelected(user.id)"
                  :disabled="!canDeleteUser(user) || isBatchDeleting || deletingUserId !== null"
                  @change="toggleUserSelection(user.id, $event.target.checked)" />
              </div>

              <div class="min-w-0">
                <h3 class="truncate text-sm font-semibold text-slate-950">
                  {{ user.real_name || user.username }}
                </h3>
                <p v-if="user.real_name && user.username" class="mt-1 truncate text-sm text-slate-600">
                  {{ user.username }}
                </p>
                <p v-if="user.email" class="mt-1 truncate text-sm text-slate-500">
                  {{ user.email }}
                </p>
              </div>
            </div>

            <div class="mt-3 lg:mt-0">
              <p class="mb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400 lg:hidden">角色</p>
              <span class="inline-flex rounded-lg px-2.5 py-1 text-xs font-medium"
                :class="getRoleBadgeClass(user.role)">
                {{ roleLabelMap[user.role] || user.role }}
              </span>
            </div>

            <div class="mt-3 text-sm text-slate-600 lg:mt-0">
              <p class="mb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400 lg:hidden">学号</p>
              {{ user.student_id || '未填写' }}
            </div>

            <div class="mt-3 text-sm text-slate-600 lg:mt-0">
              <p class="mb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400 lg:hidden">最近登录</p>
              {{ formatDateTime(user.last_login) }}
            </div>

            <div class="mt-3 flex flex-wrap gap-2 lg:mt-0 lg:justify-end">
              <button type="button"
                class="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-950"
                @click="editUser(user)">
                编辑
              </button>
              <button v-if="authStore.isTeacher" type="button"
                class="rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="deletingUserId === user.id || isBatchDeleting || !canDeleteUser(user)"
                @click="removeUser(user)">
                {{ deletingUserId === user.id ? '删除中...' : '删除' }}
              </button>
            </div>
          </article>
        </div>

        <div v-if="!isLoading && filteredUsers.length > 0"
          class="mt-3 flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div class="text-sm text-slate-600">
            显示第 {{ currentPageStart }} - {{ currentPageEnd }} 条，共 {{ filteredUsers.length }} 条
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <label class="text-sm text-slate-600">每页</label>
            <select v-model.number="pagination.pageSize"
              class="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100">
              <option v-for="size in PAGE_SIZE_OPTIONS" :key="size" :value="size">{{ size }}</option>
            </select>

            <button type="button"
              class="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:border-slate-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="pagination.page <= 1" @click="goToPrevPage">
              上一页
            </button>

            <span class="min-w-[72px] text-center text-sm text-slate-600">
              {{ pagination.page }} / {{ totalPages }}
            </span>

            <button type="button"
              class="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:border-slate-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="pagination.page >= totalPages" @click="goToNextPage">
              下一页
            </button>
          </div>
        </div>
      </section>
    </div>
  </AppShell>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import { useAuthStore } from '@/stores/auth'
import api from '@/utils/api'
import { formatUtc8DateTime } from '@/utils/dateTime'

const authStore = useAuthStore()
const router = useRouter()

const roleLabelMap = {
  admin: '管理员',
  teacher: '教师',
  student: '学生'
}

const PAGE_SIZE_OPTIONS = [20, 50, 100]
const BATCH_DELETE_REQUEST_CHUNK_SIZE = 50

const isLoading = ref(false)
const deletingUserId = ref(null)
const isBatchDeleting = ref(false)
const pageError = ref('')
const pageNotice = ref('')
const users = ref([])
const selectedUserIds = ref([])
const pagination = reactive({
  page: 1,
  pageSize: 20
})
const batchDeleteProgress = reactive({
  visible: false,
  total: 0,
  processed: 0,
  totalChunks: 0,
  completedChunks: 0
})

const filters = reactive({
  keyword: '',
  role: 'all'
})

const overviewStats = computed(() => {
  const total = users.value.length
  const adminCount = users.value.filter((user) => user.role === 'admin').length
  const teacherCount = users.value.filter((user) => user.role === 'teacher').length
  const studentCount = users.value.filter((user) => user.role === 'student').length

  return {
    total,
    adminCount,
    teacherCount,
    studentCount
  }
})

const roleStats = computed(() => {
  if (!authStore.isAdmin) {
    return [
      {
        label: '学生',
        value: overviewStats.value.studentCount,
        dotClass: 'bg-emerald-500'
      }
    ]
  }

  return [
    {
      label: '管理员',
      value: overviewStats.value.adminCount,
      dotClass: 'bg-slate-900'
    },
    {
      label: '教师',
      value: overviewStats.value.teacherCount,
      dotClass: 'bg-amber-500'
    },
    {
      label: '学生',
      value: overviewStats.value.studentCount,
      dotClass: 'bg-emerald-500'
    }
  ]
})

const filteredUsers = computed(() => {
  const keyword = filters.keyword.trim().toLowerCase()

  return users.value.filter((user) => {
    const roleMatched = !authStore.isAdmin || filters.role === 'all' || user.role === filters.role
    if (!roleMatched) {
      return false
    }

    if (!keyword) {
      return true
    }

    const haystack = [
      user.username,
      user.real_name,
      user.email,
      user.student_id
    ].filter(Boolean).join(' ').toLowerCase()

    return haystack.includes(keyword)
  })
})

const totalPages = computed(() => {
  const total = Math.max(1, Math.ceil(filteredUsers.value.length / pagination.pageSize))
  return total
})

const paginatedUsers = computed(() => {
  const startIndex = (pagination.page - 1) * pagination.pageSize
  const endIndex = startIndex + pagination.pageSize
  return filteredUsers.value.slice(startIndex, endIndex)
})

const selectablePageUsers = computed(() => {
  return paginatedUsers.value.filter((user) => canDeleteUser(user))
})

const selectedUsersCount = computed(() => selectedUserIds.value.length)
const batchDeleteProgressPercent = computed(() => {
  if (!batchDeleteProgress.total) {
    return 0
  }

  return Math.min(100, Math.round((batchDeleteProgress.processed / batchDeleteProgress.total) * 100))
})

const isAllCurrentPageSelected = computed(() => {
  if (!selectablePageUsers.value.length) {
    return false
  }

  return selectablePageUsers.value.every((user) => isUserSelected(user.id))
})

const currentPageStart = computed(() => {
  if (!filteredUsers.value.length) {
    return 0
  }

  return (pagination.page - 1) * pagination.pageSize + 1
})

const currentPageEnd = computed(() => {
  if (!filteredUsers.value.length) {
    return 0
  }

  return Math.min(pagination.page * pagination.pageSize, filteredUsers.value.length)
})

watch(
  () => [filters.keyword, filters.role],
  () => {
    pagination.page = 1
  }
)

watch(
  () => pagination.pageSize,
  () => {
    pagination.page = 1
  }
)

watch(
  () => filteredUsers.value.length,
  () => {
    if (pagination.page > totalPages.value) {
      pagination.page = totalPages.value
    }
  }
)

function formatDateTime(value) {
  return formatUtc8DateTime(value, '暂无记录')
}

function getRoleBadgeClass(role) {
  if (role === 'admin') {
    return 'bg-slate-900 text-white'
  }

  if (role === 'teacher') {
    return 'bg-amber-100 text-amber-700'
  }

  return 'bg-emerald-100 text-emerald-700'
}

async function loadUsers() {
  isLoading.value = true
  pageError.value = ''
  pageNotice.value = ''

  try {
    const response = await api.get('/users')
    users.value = response.users || []
    syncSelectedUserIds()
  } catch (error) {
    console.error('加载用户列表失败:', error)
    pageError.value = error?.error || error?.message || '用户列表加载失败，请稍后重试'
  } finally {
    isLoading.value = false
  }
}

function editUser(user) {
  router.push(`/admin/users/${user.id}/edit`)
}

function canDeleteUser(user) {
  if (!user || !authStore.isTeacher) {
    return false
  }

  if (Number(user.id) === Number(authStore.user?.id)) {
    return false
  }

  if (authStore.isAdmin) {
    return true
  }

  return user.role === 'student'
}

function isUserSelected(userId) {
  return selectedUserIds.value.includes(Number(userId))
}

function toggleUserSelection(userId, checked) {
  const normalizedUserId = Number(userId)
  if (!Number.isFinite(normalizedUserId)) {
    return
  }

  const currentSet = new Set(selectedUserIds.value)
  if (checked) {
    currentSet.add(normalizedUserId)
  } else {
    currentSet.delete(normalizedUserId)
  }

  selectedUserIds.value = Array.from(currentSet)
}

function toggleSelectCurrentPage(checked) {
  const currentSet = new Set(selectedUserIds.value)

  for (const user of selectablePageUsers.value) {
    const normalizedUserId = Number(user.id)
    if (!Number.isFinite(normalizedUserId)) {
      continue
    }

    if (checked) {
      currentSet.add(normalizedUserId)
    } else {
      currentSet.delete(normalizedUserId)
    }
  }

  selectedUserIds.value = Array.from(currentSet)
}

function goToPrevPage() {
  if (pagination.page <= 1) {
    return
  }

  pagination.page -= 1
}

function goToNextPage() {
  if (pagination.page >= totalPages.value) {
    return
  }

  pagination.page += 1
}

function syncSelectedUserIds() {
  const existingUserIdSet = new Set(
    users.value
      .map((item) => Number(item.id))
      .filter((item) => Number.isFinite(item))
  )

  selectedUserIds.value = selectedUserIds.value.filter((item) => existingUserIdSet.has(Number(item)))
}

async function removeUser(user) {
  if (!canDeleteUser(user)) {
    pageError.value = '当前权限不能删除该用户'
    return
  }

  const confirmed = window.confirm(`确定要删除用户“${user.real_name || user.username}”吗？此操作不可撤销。`)
  if (!confirmed) {
    return
  }

  deletingUserId.value = user.id
  pageError.value = ''
  pageNotice.value = ''

  try {
    await api.delete(`/users/${user.id}`)
    users.value = users.value.filter((item) => item.id !== user.id)
    syncSelectedUserIds()
  } catch (error) {
    console.error('删除用户失败:', error)
    pageError.value = error?.error || error?.message || '删除用户失败，请稍后重试'
  } finally {
    deletingUserId.value = null
  }
}

async function removeSelectedUsers() {
  if (!selectedUserIds.value.length) {
    return
  }

  const deletableSelectedIds = selectedUserIds.value.filter((id) => {
    const targetUser = users.value.find((item) => Number(item.id) === Number(id))
    return canDeleteUser(targetUser)
  })

  if (!deletableSelectedIds.length) {
    pageError.value = '当前选择中没有可删除账号'
    return
  }

  const confirmed = window.confirm(`确定要批量删除已选的 ${deletableSelectedIds.length} 个账号吗？此操作不可撤销。`)
  if (!confirmed) {
    return
  }

  isBatchDeleting.value = true
  pageError.value = ''
  pageNotice.value = ''

  const totalChunks = Math.max(1, Math.ceil(deletableSelectedIds.length / BATCH_DELETE_REQUEST_CHUNK_SIZE))
  batchDeleteProgress.visible = true
  batchDeleteProgress.total = deletableSelectedIds.length
  batchDeleteProgress.processed = 0
  batchDeleteProgress.totalChunks = totalChunks
  batchDeleteProgress.completedChunks = 0

  try {
    const mergedDeletedUsers = []
    const mergedSkipped = []
    let requestFailedError = null

    for (let startIndex = 0; startIndex < deletableSelectedIds.length; startIndex += BATCH_DELETE_REQUEST_CHUNK_SIZE) {
      const requestChunk = deletableSelectedIds.slice(startIndex, startIndex + BATCH_DELETE_REQUEST_CHUNK_SIZE)

      try {
        const response = await api.post('/users/batch-delete', {
          user_ids: requestChunk
        }, {
          timeout: 120000
        })

        mergedDeletedUsers.push(...(response.deleted_users || []))
        mergedSkipped.push(...(response.skipped || []))
        batchDeleteProgress.processed += requestChunk.length
        batchDeleteProgress.completedChunks += 1
      } catch (chunkError) {
        requestFailedError = chunkError
        break
      }
    }

    const deletedUserIds = new Set(
      mergedDeletedUsers
        .map((item) => Number(item.id))
        .filter((item) => Number.isFinite(item))
    )

    if (deletedUserIds.size) {
      users.value = users.value.filter((item) => !deletedUserIds.has(Number(item.id)))
    }

    syncSelectedUserIds()
    pageNotice.value = `批量删除完成，成功 ${mergedDeletedUsers.length} 个，跳过 ${mergedSkipped.length} 个`

    const skippedCount = Number(mergedSkipped.length || 0)
    if (skippedCount > 0) {
      const skippedPreview = mergedSkipped
        .slice(0, 3)
        .map((item) => {
          const label = item.username || `#${item.id}`
          return `${label}: ${item.reason || '删除失败'}`
        })
        .join('；')

      pageError.value = skippedPreview
        ? `有 ${skippedCount} 个账号未删除。${skippedPreview}`
        : `有 ${skippedCount} 个账号未删除。`
    }

    if (requestFailedError) {
      const requestErrorMessage = requestFailedError?.error || requestFailedError?.message || '后续批次请求失败'
      pageError.value = pageError.value
        ? `${pageError.value}；${requestErrorMessage}`
        : requestErrorMessage
    }
  } catch (error) {
    console.error('批量删除失败:', error)
    pageError.value = error?.error || error?.message || '批量删除失败，请稍后重试'
  } finally {
    isBatchDeleting.value = false
    batchDeleteProgress.visible = false
  }
}

onMounted(async () => {
  if (!authStore.isTeacher) {
    router.replace('/dashboard')
    return
  }

  await loadUsers()
})
</script>
