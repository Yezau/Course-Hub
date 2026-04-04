<template>
  <div class="ui-auth-shell flex min-h-screen items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
    <div class="ui-auth-card space-y-6">
      <div class="space-y-4 text-center">
        <div class="flex justify-center">
          <SiteBrand
            link-to="/"
            :title="settings.site_name"
            :logo-text="settings.site_logo_text"
            :logo-url="settings.site_logo_url"
          />
        </div>

        <div>
          <h2 class="text-3xl font-extrabold text-gray-900">
            {{ settings.register_title }}
          </h2>
          <p class="mt-2 text-sm text-slate-500">
            {{ settings.register_description }}
          </p>
        </div>
      </div>

      <form class="space-y-5" @submit.prevent="handleRegister">
        <div v-if="error" class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
          {{ error }}
        </div>

        <div v-if="success" class="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700">
          注册成功，正在跳转到登录页面...
        </div>

        <div class="space-y-4">
          <div>
            <label for="username" class="mb-1.5 block text-sm font-medium text-slate-700">
              用户名
            </label>
            <input
              id="username"
              v-model="form.username"
              type="text"
              required
              class="ui-input"
              placeholder="请输入用户名"
            />
          </div>

          <div>
            <label for="email" class="mb-1.5 block text-sm font-medium text-slate-700">
              邮箱（选填）
            </label>
            <input
              id="email"
              v-model="form.email"
              type="email"
              class="ui-input"
              placeholder="选填，可留空"
            />
          </div>

          <div>
            <label for="real_name" class="mb-1.5 block text-sm font-medium text-slate-700">
              真实姓名
            </label>
            <input
              id="real_name"
              v-model="form.real_name"
              type="text"
              required
              class="ui-input"
              placeholder="请输入真实姓名"
            />
          </div>

          <div>
            <label for="student_id" class="mb-1.5 block text-sm font-medium text-slate-700">
              学号
            </label>
            <input
              id="student_id"
              v-model="form.student_id"
              type="text"
              class="ui-input"
              placeholder="请输入学号（选填）"
            />
            <p class="mt-1.5 text-xs text-slate-500">
              填写学号后，可直接使用学号登录
            </p>
          </div>

          <div>
            <label for="password" class="mb-1.5 block text-sm font-medium text-slate-700">
              密码
            </label>
            <input
              id="password"
              v-model="form.password"
              type="password"
              required
              class="ui-input"
              placeholder="至少 8 位，需包含两类字符"
            />
          </div>

          <div>
            <label for="confirm_password" class="mb-1.5 block text-sm font-medium text-slate-700">
              确认密码
            </label>
            <input
              id="confirm_password"
              v-model="form.confirm_password"
              type="password"
              required
              class="ui-input"
              placeholder="请再次输入密码"
            />
          </div>
        </div>

        <button
          type="submit"
          :disabled="isLoading"
          class="ui-button-primary flex w-full justify-center disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {{ isLoading ? '注册中...' : '注册' }}
        </button>

        <div class="text-center">
          <router-link
            to="/login"
            class="text-sm font-medium text-slate-700 transition hover:text-slate-950"
          >
            已有账号？立即登录
          </router-link>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import SiteBrand from '@/components/SiteBrand.vue'
import { useAuthStore } from '@/stores/auth'
import { useSiteSettingsStore } from '@/stores/siteSettings'

const router = useRouter()
const authStore = useAuthStore()
const siteSettingsStore = useSiteSettingsStore()

const settings = computed(() => siteSettingsStore.publicSettings)

const form = ref({
  username: '',
  email: '',
  real_name: '',
  student_id: '',
  password: '',
  confirm_password: ''
})

const error = ref('')
const success = ref(false)
const isLoading = ref(false)

async function handleRegister() {
  error.value = ''

  if (form.value.password.length < 8) {
    error.value = '密码至少需要 8 位'
    return
  }

  if (form.value.password !== form.value.confirm_password) {
    error.value = '两次输入的密码不一致'
    return
  }

  isLoading.value = true

  try {
    await authStore.register({
      username: form.value.username,
      email: form.value.email,
      real_name: form.value.real_name,
      student_id: form.value.student_id,
      password: form.value.password
    })

    success.value = true
    setTimeout(() => {
      router.push('/login')
    }, 1800)
  } catch (err) {
    error.value = err?.error || err?.message || '注册失败，请稍后重试'
  } finally {
    isLoading.value = false
  }
}
</script>
