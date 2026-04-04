<template>
  <div class="min-h-screen bg-slate-50 text-slate-950">
    <nav class="border-b border-slate-200 bg-white">
      <div class="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <SiteBrand
          link-to="/"
          :title="settings.site_name"
          :logo-text="settings.site_logo_text"
          :logo-url="settings.site_logo_url"
        />

        <div class="flex items-center gap-2 sm:gap-3">
          <router-link
            v-if="authStore.isAuthenticated"
            to="/dashboard"
            class="ui-button-secondary"
          >
            进入后台
          </router-link>

          <template v-else>
            <router-link
              to="/login"
              class="ui-button-secondary"
            >
              登录
            </router-link>
            <router-link
              v-if="siteSettingsStore.canShowRegisterEntry"
              to="/register"
              class="ui-button-primary"
            >
              注册
            </router-link>
          </template>
        </div>
      </div>
    </nav>

    <main class="ui-page max-w-6xl lg:py-8">
      <section class="ui-surface sm:p-8">
        <h2 class="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
          {{ settings.homepage_title }}
        </h2>
        <p class="mt-4 max-w-3xl text-sm leading-7 text-slate-500">
          {{ settings.homepage_description }}
        </p>

        <div class="mt-6 flex flex-wrap gap-3">
          <router-link
            :to="primaryAction.to"
            class="ui-button-primary px-5 py-3"
          >
            {{ primaryAction.label }}
          </router-link>
          <router-link
            v-if="secondaryAction"
            :to="secondaryAction.to"
            class="ui-button-secondary px-5 py-3"
          >
            {{ secondaryAction.label }}
          </router-link>
        </div>
      </section>

      <section class="mt-4 grid gap-4 md:grid-cols-3">
        <article
          v-for="feature in features"
          :key="feature.title"
          class="ui-surface"
        >
          <div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
            <svg
              class="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.8"
                :d="feature.icon"
              />
            </svg>
          </div>
          <h3 class="mt-5 text-lg font-semibold text-slate-950">
            {{ feature.title }}
          </h3>
          <p class="mt-2 text-sm leading-7 text-slate-500">
            {{ feature.description }}
          </p>
        </article>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useSiteSettingsStore } from '@/stores/siteSettings'
import SiteBrand from '@/components/SiteBrand.vue'

const authStore = useAuthStore()
const siteSettingsStore = useSiteSettingsStore()

const settings = computed(() => siteSettingsStore.publicSettings)
const canShowRegisterEntry = computed(() => siteSettingsStore.canShowRegisterEntry)

const primaryAction = computed(() => {
  if (authStore.isAuthenticated) {
    return { to: '/dashboard', label: '进入仪表盘' }
  }

  if (!canShowRegisterEntry.value) {
    return {
      to: '/login',
      label: settings.value.homepage_secondary_label || '登录'
    }
  }

  return {
    to: '/register',
    label: settings.value.homepage_primary_label || '立即使用'
  }
})

const secondaryAction = computed(() => {
  if (authStore.isAuthenticated) {
    return { to: '/materials', label: '查看课件资料' }
  }

  if (!canShowRegisterEntry.value) {
    return null
  }

  return {
    to: '/login',
    label: settings.value.homepage_secondary_label || '已有账号登录'
  }
})

const features = [
  {
    title: '课件资料',
    description: '按章节统一管理课程文件，支持受保护下载与常见格式预览。',
    icon: 'M19.5 14.25v-8.625a1.125 1.125 0 00-1.125-1.125H8.62a1.125 1.125 0 00-.796.33L4.08 8.574a1.125 1.125 0 00-.33.796v8.88a1.125 1.125 0 001.125 1.125h13.5A1.125 1.125 0 0019.5 18.25z'
  },
  {
    title: '作业管理',
    description: '覆盖作业发布、提交、批改与反馈，让教学流程在同一后台内闭环。',
    icon: 'M9 5.25h6M9 9.75h6M9 14.25h3.75M6.75 3.75h10.5A2.25 2.25 0 0119.5 6v12a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 18V6a2.25 2.25 0 012.25-2.25z'
  },
  {
    title: '讨论交流',
    description: '通过主题帖和回复维持教学互动，适合课程通知、提问和经验沉淀。',
    icon: 'M7.5 8.25h9m-9 3h6m-9 8.25l1.56-3.12a8.97 8.97 0 01-1.12-4.38c0-4.97 4.03-9 9-9s9 4.03 9 9-4.03 9-9 9a8.97 8.97 0 01-4.38-1.12L4.5 19.5z'
  }
]
</script>
