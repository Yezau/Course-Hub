<template>
  <div class="ui-auth-shell flex min-h-screen items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
    <div class="ui-auth-card space-y-6">
      <div class="space-y-4 text-center">
        <div class="flex justify-center">
          <SiteBrand link-to="/" :title="settings.site_name" :logo-text="settings.site_logo_text"
            :logo-url="settings.site_logo_url" />
        </div>

        <div>
          <h2 class="text-3xl font-extrabold text-gray-900">
            {{ settings.login_title }}
          </h2>
          <p class="mt-2 text-sm text-slate-500">
            {{ settings.login_description }}
          </p>
        </div>
      </div>

      <form class="space-y-5" @submit.prevent="handleLogin">
        <div v-if="error" class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
          {{ error }}
        </div>

        <div class="space-y-4">
          <div>
            <label for="account" class="mb-1.5 block text-sm font-medium text-slate-700">
              账号
            </label>
            <input id="account" v-model="form.account" type="text" required class="ui-input"
              placeholder="请输入用户名、学号或邮箱" />
            <p class="mt-1.5 text-xs text-slate-500">
              支持使用用户名、学号或邮箱登录
            </p>
          </div>

          <div>
            <label for="password" class="mb-1.5 block text-sm font-medium text-slate-700">
              密码
            </label>
            <input id="password" v-model="form.password" type="password" required class="ui-input"
              placeholder="请输入密码" />
          </div>

          <div v-if="captcha.visible">
            <label for="captcha" class="mb-1.5 block text-sm font-medium text-slate-700">
              数字验证码
            </label>
            <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr),180px]">
              <input id="captcha" v-model="form.captcha" type="text" inputmode="numeric" maxlength="4" class="ui-input"
                placeholder="请输入右侧 4 位数字" />
              <img v-if="captcha.image" :src="captcha.image" alt="数字验证码"
                class="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 object-contain" />
            </div>
          </div>
        </div>

        <button type="submit" :disabled="isLoading"
          class="ui-button-primary flex w-full justify-center disabled:cursor-not-allowed disabled:bg-slate-300">
          {{ isLoading ? '登录中...' : '登录' }}
        </button>

        <div class="text-center">
          <router-link v-if="siteSettingsStore.canShowRegisterEntry" to="/register"
            class="text-sm font-medium text-slate-700 transition hover:text-slate-950">
            还没有账号？立即注册
          </router-link>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import SiteBrand from '@/components/SiteBrand.vue'
import { useAuthStore } from '@/stores/auth'
import { useInstallStore } from '@/stores/install'
import { useSiteSettingsStore } from '@/stores/siteSettings'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const installStore = useInstallStore()
const siteSettingsStore = useSiteSettingsStore()

const settings = computed(() => siteSettingsStore.publicSettings)

const form = ref({
  account: '',
  password: '',
  captcha: ''
})

const error = ref('')
const isLoading = ref(false)
const captcha = ref({
  visible: false,
  image: ''
})

onMounted(async () => {
  const needsSetup = await installStore.checkStatus().catch(() => false)
  if (installStore.statusKnown && needsSetup) {
    router.replace('/install')
  }
})

function applyCaptchaChallenge(payload) {
  const nextImage = payload?.captcha_image || ''
  captcha.value.visible = Boolean(payload?.require_captcha || nextImage)
  captcha.value.image = nextImage

  if (captcha.value.visible) {
    form.value.captcha = ''
  }
}

function resolveSafeRedirectPath(rawTarget, fallback = '/dashboard') {
  if (typeof rawTarget !== 'string') {
    return fallback
  }

  const target = rawTarget.trim()
  if (!target.startsWith('/') || target.startsWith('//')) {
    return fallback
  }

  return target
}

async function handleLogin() {
  error.value = ''
  isLoading.value = true

  try {
    await authStore.login(form.value)
    captcha.value = {
      visible: false,
      image: ''
    }
    form.value.captcha = ''
    const redirectTarget = resolveSafeRedirectPath(route.query.redirect, '/dashboard')
    router.push(redirectTarget)
  } catch (err) {
    if (err?.setup_required || err?.code === 'SETUP_REQUIRED') {
      await installStore.checkStatus(true)
      router.replace('/install')
      return
    }

    applyCaptchaChallenge(err)
    error.value = err?.error || err?.message || '登录失败，请检查账号和密码'
  } finally {
    isLoading.value = false
  }
}
</script>
