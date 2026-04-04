<template>
  <AppShell :title="pageTitle">
    <template #header-actions>
      <router-link to="/admin/users"
        class="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950">
        返回列表
      </router-link>
      <router-link v-if="authStore.isTeacher" to="/admin/users/batch"
        class="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950">
        批量新建
      </router-link>
    </template>

    <div class="mx-auto max-w-4xl space-y-4">
      <p v-if="pageError" class="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">
        {{ pageError }}
      </p>

      <section v-if="isPageLoading"
        class="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-sm text-slate-500">
        正在加载用户信息...
      </section>

      <form v-else class="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" @submit.prevent="submitForm">
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block">
            <span class="mb-1.5 block text-sm font-medium text-slate-700">用户名</span>
            <input v-model.trim="form.username" type="text" required placeholder="请输入用户名"
              class="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-950 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100" />
          </label>

          <label class="block">
            <span class="mb-1.5 block text-sm font-medium text-slate-700">邮箱</span>
            <input v-model.trim="form.email" type="email" placeholder="选填"
              class="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-950 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100" />
          </label>

          <label class="block">
            <span class="mb-1.5 block text-sm font-medium text-slate-700">角色</span>
            <select v-if="authStore.isAdmin" v-model="form.role" :disabled="isLastAdminRoleLocked"
              class="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-950 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100">
              <option value="admin">管理员</option>
              <option value="teacher" :disabled="isLastAdminRoleLocked">教师</option>
              <option value="student" :disabled="isLastAdminRoleLocked">学生</option>
            </select>
            <input v-else :value="roleLabelMap[form.role] || form.role" type="text" readonly disabled
              class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-500" />
            <p v-if="isLastAdminRoleLocked" class="mt-1.5 text-xs text-amber-700">
              当前账号是系统最后一个管理员，不能切换为其他身份。
            </p>
          </label>

          <label class="block">
            <span class="mb-1.5 block text-sm font-medium text-slate-700">真实姓名</span>
            <input v-model.trim="form.real_name" type="text" placeholder="请输入真实姓名"
              class="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-950 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100" />
          </label>

          <label class="block">
            <span class="mb-1.5 block text-sm font-medium text-slate-700">
              {{ form.role === 'student' ? '学号' : '身份标识' }}
            </span>
            <input v-model.trim="form.student_id" type="text" :placeholder="form.role === 'student' ? '请输入学号' : '选填'"
              class="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-950 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100" />
          </label>

          <label class="block">
            <span class="mb-1.5 block text-sm font-medium text-slate-700">头像地址</span>
            <input v-model.trim="form.avatar_url" type="text" placeholder="https://example.com/avatar.png"
              class="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-950 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100" />
          </label>

          <label class="block sm:col-span-2">
            <span class="mb-1.5 block text-sm font-medium text-slate-700">
              {{ isEditMode ? '重置密码' : '登录密码' }}
            </span>
            <input v-model="form.password" type="password" :required="!isEditMode"
              :placeholder="isEditMode ? '留空表示不修改' : '至少 6 位'"
              class="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-950 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100" />
          </label>
        </div>

        <p v-if="saveMessage" class="mt-4 rounded-xl px-3.5 py-2.5 text-sm"
          :class="saveState === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'">
          {{ saveMessage }}
        </p>

        <div class="mt-4 flex flex-wrap gap-2">
          <button type="submit" :disabled="isSaving"
            class="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">
            {{ isSaving ? '保存中...' : isEditMode ? '保存修改' : '创建账号' }}
          </button>
        </div>
      </form>
    </div>
  </AppShell>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import { useAuthStore } from '@/stores/auth'
import api from '@/utils/api'

const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()

const roleLabelMap = {
  admin: '管理员',
  teacher: '教师',
  student: '学生'
}

const isPageLoading = ref(false)
const isSaving = ref(false)
const pageError = ref('')
const saveMessage = ref('')
const saveState = ref('success')
const originalRole = ref('student')
const adminCount = ref(0)

const form = reactive({
  username: '',
  email: '',
  role: 'student',
  real_name: '',
  student_id: '',
  avatar_url: '',
  password: ''
})

const isEditMode = computed(() => Boolean(route.params.id))
const pageTitle = computed(() => (isEditMode.value ? '编辑账号' : '新建账号'))
const isLastAdminRoleLocked = computed(() => {
  return authStore.isAdmin && isEditMode.value && originalRole.value === 'admin' && adminCount.value <= 1
})

function resetFormFields() {
  form.username = ''
  form.email = ''
  form.role = 'student'
  form.real_name = ''
  form.student_id = ''
  form.avatar_url = ''
  form.password = ''
}

function applyUserToForm(user) {
  form.username = user?.username || ''
  form.email = user?.email || ''
  form.role = user?.role || 'student'
  originalRole.value = user?.role || 'student'
  form.real_name = user?.real_name || ''
  form.student_id = user?.student_id || ''
  form.avatar_url = user?.avatar_url || ''
  form.password = ''
}

function resetMessages() {
  pageError.value = ''
  saveMessage.value = ''
  saveState.value = 'success'
}

async function loadUser() {
  if (!route.params.id) {
    return
  }

  isPageLoading.value = true
  pageError.value = ''

  try {
    const response = await api.get(`/users/${route.params.id}`)

    if (!authStore.isAdmin && response.user?.role !== 'student') {
      router.replace('/admin/users')
      return
    }

    applyUserToForm(response.user)

    if (authStore.isAdmin) {
      await loadAdminCount()
    }
  } catch (error) {
    console.error('加载用户失败:', error)
    pageError.value = error?.error || error?.message || '加载用户信息失败，请稍后重试'
  } finally {
    isPageLoading.value = false
  }
}

async function loadAdminCount() {
  try {
    const response = await api.get('/users')
    const allUsers = response.users || []
    adminCount.value = allUsers.filter((item) => item.role === 'admin').length
  } catch (error) {
    adminCount.value = 2
  }
}

async function initializePage() {
  resetMessages()

  if (!isEditMode.value && !authStore.isTeacher) {
    router.replace('/dashboard')
    return
  }

  if (isEditMode.value && !authStore.isTeacher) {
    router.replace('/dashboard')
    return
  }

  if (isEditMode.value) {
    await loadUser()
  } else {
    resetFormFields()
    originalRole.value = 'student'
    adminCount.value = 0
    isPageLoading.value = false
  }
}

function buildPayload() {
  const payload = {
    username: form.username.trim(),
    email: form.email.trim(),
    real_name: form.real_name.trim(),
    student_id: form.student_id.trim(),
    avatar_url: form.avatar_url.trim()
  }

  if (authStore.isAdmin) {
    payload.role = form.role
  }

  if (form.password) {
    payload.password = form.password
  }

  return payload
}

async function submitForm() {
  resetMessages()

  if (!form.username.trim()) {
    saveState.value = 'error'
    saveMessage.value = '用户名为必填项'
    return
  }

  if (!isEditMode.value && form.password.length < 6) {
    saveState.value = 'error'
    saveMessage.value = '新建用户时密码至少需要 6 位'
    return
  }

  if (isEditMode.value && form.password && form.password.length < 6) {
    saveState.value = 'error'
    saveMessage.value = '重置密码至少需要 6 位'
    return
  }

  if (isLastAdminRoleLocked.value && form.role !== 'admin') {
    form.role = 'admin'
    saveState.value = 'error'
    saveMessage.value = '最后一个管理员账号不能切换身份'
    return
  }

  isSaving.value = true

  try {
    const payload = buildPayload()
    const response = isEditMode.value
      ? await api.put(`/users/${route.params.id}`, payload)
      : await api.post('/users', payload)

    const savedUser = response.user

    if (isEditMode.value) {
      applyUserToForm(savedUser)
      saveMessage.value = '用户信息已更新'
    } else {
      resetFormFields()
      saveMessage.value = `用户 ${savedUser.username} 已创建，可继续新建下一个账号`
    }

    saveState.value = 'success'

    if (savedUser.id === authStore.user?.id) {
      authStore.user = {
        ...authStore.user,
        ...savedUser
      }

      if (savedUser.role !== 'admin') {
        router.replace('/dashboard')
      }
    }
  } catch (error) {
    console.error('保存用户失败:', error)
    saveState.value = 'error'
    saveMessage.value = error?.error || error?.message || '保存失败，请稍后重试'
  } finally {
    isSaving.value = false
  }
}

onMounted(async () => {
  await initializePage()
})

watch(() => route.fullPath, async () => {
  await initializePage()
})
</script>
