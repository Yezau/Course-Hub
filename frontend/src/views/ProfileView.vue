<template>
  <AppShell title="账号设置">
    <div class="mx-auto max-w-6xl ui-stack">
      <section class="ui-surface overflow-hidden">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div class="flex min-w-0 items-center gap-4">
            <div v-if="displayAvatar"
              class="h-16 w-16 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
              <img :src="displayAvatar" :alt="displayName" class="h-full w-full object-cover">
            </div>
            <div v-else
              class="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 text-xl font-semibold text-white shadow-sm">
              {{ userInitial }}
            </div>

            <div class="min-w-0">
              <p class="truncate text-sm font-medium text-slate-500">{{ siteName }}</p>
              <h2 class="truncate text-2xl font-semibold tracking-tight text-slate-950">{{ displayName }}</h2>
            </div>
          </div>

          <div class="flex flex-wrap gap-2 lg:justify-end">
            <span class="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-600">
              {{ roleLabel }}
            </span>
            <span class="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-600">
              账号基础资料
            </span>
          </div>
        </div>

        <p v-if="loadError"
          class="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {{ loadError }}
        </p>

        <div class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <article v-for="row in accountRows" :key="row.label"
            class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p class="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">{{ row.label }}</p>
            <p class="mt-2 break-words text-sm font-semibold text-slate-950">{{ row.value }}</p>
          </article>
        </div>
      </section>

      <section class="ui-surface overflow-hidden">
        <h2 class="text-xl font-semibold text-slate-950">资料维护</h2>

        <form class="mt-5 space-y-4" @submit.prevent="handleUpdateProfile">
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="block">
              <span class="mb-2 block text-sm font-medium text-slate-700">真实姓名</span>
              <input v-model.trim="editForm.real_name" type="text" placeholder="请输入真实姓名" class="ui-input">
            </label>

            <label class="block">
              <span class="mb-2 block text-sm font-medium text-slate-700">用户名</span>
              <input v-model.trim="editForm.username" type="text" placeholder="请输入用户名" class="ui-input">
            </label>

            <label class="block">
              <span class="mb-2 block text-sm font-medium text-slate-700">邮箱</span>
              <input v-model.trim="editForm.email" type="email" placeholder="选填" class="ui-input">
            </label>

            <label class="block">
              <span class="mb-2 block text-sm font-medium text-slate-700">
                {{ studentIdLabel }}
              </span>
              <input :value="currentUser?.student_id || ''" type="text" readonly disabled
                class="ui-input cursor-not-allowed bg-slate-50 text-slate-500">
              <span v-if="currentUser?.role === 'student'" class="mt-1.5 block text-xs text-slate-500">
                学号由教师或管理员维护，学生本人不能修改。
              </span>
            </label>

            <label class="block sm:col-span-2">
              <span class="mb-2 block text-sm font-medium text-slate-700">头像地址</span>
              <input v-model.trim="editForm.avatar_url" type="text" placeholder="https://example.com/avatar.png"
                class="ui-input">
            </label>

            <div class="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div class="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div v-if="previewAvatar"
                  class="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <img :src="previewAvatar" :alt="previewName" class="h-full w-full object-cover">
                </div>
                <div v-else
                  class="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-xl font-semibold text-white">
                  {{ previewInitial }}
                </div>

                <div class="min-w-0 flex-1">
                  <p class="text-sm font-semibold text-slate-950">上传个人头像</p>
                  <p class="mt-1 text-sm leading-6 text-slate-500">
                    支持 PNG、JPG、WEBP、GIF。上传后会立即更新当前账号头像。
                  </p>

                  <div class="mt-4 flex flex-wrap gap-2">
                    <label class="ui-button-secondary cursor-pointer"
                      :class="isUploadingAvatar ? 'pointer-events-none opacity-60' : ''">
                      <input class="sr-only" type="file" accept="image/png,image/jpeg,image/webp,image/gif"
                        :disabled="isUploadingAvatar" @change="handleAvatarSelected">
                      {{ isUploadingAvatar ? '上传中...' : '上传头像' }}
                    </label>

                    <button type="button" class="ui-button-secondary"
                      :disabled="isUploadingAvatar || !editForm.avatar_url" @click="clearAvatarUrl">
                      清空头像地址
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <button type="submit" :disabled="isSaving || isUploadingAvatar || !hasProfileChanges"
              class="inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">
              {{ isSaving ? '正在保存...' : '保存资料' }}
            </button>
            <p v-if="saveMessage" class="mt-3 rounded-xl px-4 py-3 text-sm"
              :class="saveState === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'">
              {{ saveMessage }}
            </p>
          </div>
        </form>
      </section>
    </div>
  </AppShell>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useSiteSettingsStore } from '@/stores/siteSettings'
import api, { resolveAssetUrl } from '@/utils/api'
import { formatUtc8Date } from '@/utils/dateTime'
import AppShell from '@/components/AppShell.vue'

const authStore = useAuthStore()
const siteSettingsStore = useSiteSettingsStore()

const isSaving = ref(false)
const isUploadingAvatar = ref(false)
const loadError = ref('')
const saveMessage = ref('')
const saveState = ref('success')

const profileUser = ref(null)
const editForm = ref({
  real_name: '',
  username: '',
  email: '',
  avatar_url: ''
})

const currentUser = computed(() => profileUser.value || authStore.user || {})
const siteName = computed(() => siteSettingsStore.brandName)
const displayName = computed(() => currentUser.value?.real_name || currentUser.value?.username || '未命名用户')
const userInitial = computed(() => displayName.value.trim().charAt(0).toUpperCase() || 'U')
const displayAvatar = computed(() => resolveAssetUrl(currentUser.value?.avatar_url || ''))
const studentIdLabel = computed(() => (currentUser.value?.role === 'student' ? '学号' : '身份标识'))

const previewName = computed(() => editForm.value.real_name || editForm.value.username || currentUser.value?.username || '未命名用户')
const previewInitial = computed(() => previewName.value.trim().charAt(0).toUpperCase() || 'U')
const previewAvatar = computed(() => resolveAssetUrl(editForm.value.avatar_url || ''))

const roleLabel = computed(() => {
  if (currentUser.value?.role === 'admin') return '管理员'
  if (currentUser.value?.role === 'teacher') return '教师'
  return '学生'
})

const accountRows = computed(() => [
  {
    label: '用户名',
    value: currentUser.value?.username || '未设置'
  },
  {
    label: '邮箱地址',
    value: currentUser.value?.email || '未设置'
  },
  {
    label: '账号角色',
    value: roleLabel.value
  },
  {
    label: studentIdLabel.value,
    value: currentUser.value?.student_id || '未填写'
  },
  {
    label: '账号编号',
    value: currentUser.value?.id ? `#${currentUser.value.id}` : '未分配'
  },
  {
    label: '注册时间',
    value: formatDate(currentUser.value?.created_at)
  }
])

const hasProfileChanges = computed(() => {
  return (
    (editForm.value.real_name || '') !== (currentUser.value?.real_name || '')
    || (editForm.value.username || '') !== (currentUser.value?.username || '')
    || (editForm.value.email || '') !== (currentUser.value?.email || '')
    || (editForm.value.avatar_url || '') !== (currentUser.value?.avatar_url || '')
  )
})

function formatDate(value) {
  return formatUtc8Date(value, '未记录')
}

function syncFormWithUser(user) {
  editForm.value = {
    real_name: user?.real_name || '',
    username: user?.username || '',
    email: user?.email || '',
    avatar_url: user?.avatar_url || ''
  }
}

function applyUpdatedUser(user) {
  if (!user) {
    return
  }

  profileUser.value = {
    ...(profileUser.value || authStore.user || {}),
    ...user
  }

  authStore.user = {
    ...(authStore.user || {}),
    ...user
  }
}

function clearAvatarUrl() {
  editForm.value.avatar_url = ''
}

async function loadProfilePage() {
  if (!authStore.user?.id) {
    return
  }

  loadError.value = ''

  try {
    const response = await api.get(`/users/${authStore.user.id}`)
    applyUpdatedUser(response.user)
  } catch (error) {
    applyUpdatedUser(authStore.user)
    loadError.value = '账号详情暂未同步成功，当前页面显示的是本地登录信息。'
  }

  syncFormWithUser(profileUser.value)
}

async function handleAvatarSelected(event) {
  const file = event.target.files?.[0]
  event.target.value = ''

  if (!file || !authStore.user?.id) {
    return
  }

  isUploadingAvatar.value = true
  saveMessage.value = ''

  try {
    const formData = new FormData()
    formData.append('file', file)

    const response = await api.post(`/users/${authStore.user.id}/avatar`, formData)
    applyUpdatedUser(response.user)
    editForm.value.avatar_url = response.user?.avatar_url || ''
    saveState.value = 'success'
    saveMessage.value = '头像已更新。'
  } catch (error) {
    saveState.value = 'error'
    saveMessage.value = error?.error || error?.message || '上传头像失败，请稍后重试。'
  } finally {
    isUploadingAvatar.value = false
  }
}

async function handleUpdateProfile() {
  if (!hasProfileChanges.value) {
    return
  }

  isSaving.value = true
  saveMessage.value = ''

  try {
    const response = await authStore.updateProfile({
      real_name: editForm.value.real_name,
      username: editForm.value.username,
      email: editForm.value.email,
      avatar_url: editForm.value.avatar_url
    })

    applyUpdatedUser(response.user)
    syncFormWithUser(profileUser.value)
    saveState.value = 'success'
    saveMessage.value = '资料已更新。'
  } catch (error) {
    saveState.value = 'error'
    saveMessage.value = error?.error || error?.message || '资料更新失败，请稍后重试。'
  } finally {
    isSaving.value = false
  }
}

watch(
  () => authStore.user?.id,
  (userId) => {
    if (userId) {
      loadProfilePage()
    }
  },
  { immediate: true }
)
</script>
