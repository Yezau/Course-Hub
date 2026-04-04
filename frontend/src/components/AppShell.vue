<template>
  <div
    class="flex min-h-screen flex-col bg-slate-50 text-slate-950 lg:grid lg:h-screen lg:grid-cols-[248px,minmax(0,1fr)] lg:overflow-hidden">
    <div v-if="isMobileSidebarOpen" class="fixed inset-0 z-40 bg-slate-900/35 backdrop-blur-[1px] lg:hidden"
      @click="closeMobileSidebar" />

    <DashboardSidebar :user="authStore.user" :nav-items="navItems" :mobile-open="isMobileSidebarOpen"
      @close-mobile="closeMobileSidebar" @logout="handleLogout" />

    <div class="min-w-0 flex flex-1 flex-col lg:min-h-0 lg:overflow-hidden">
      <div class="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <div class="flex items-center justify-between gap-3">
          <SiteBrand link-to="/dashboard" :title="siteSettingsStore.brandName"
            :logo-text="siteSettingsStore.publicSettings.site_logo_text"
            :logo-url="siteSettingsStore.publicSettings.site_logo_url" />

          <div class="flex items-center gap-1.5">
            <button type="button"
              class="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
              :aria-label="isDarkTheme ? '切换到浅色模式' : '切换到深色模式'" @click="toggleThemeMode">
              <svg v-if="isDarkTheme" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"
                stroke-width="1.8">
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M12 3v1.5m0 15V21m9-9h-1.5M4.5 12H3m15.364 6.364l-1.06-1.06M6.696 6.696l-1.06-1.06m12.728 0l-1.06 1.06M6.696 17.304l-1.06 1.06M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
              </svg>
              <svg v-else class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M21.752 15.002A9.718 9.718 0 0112 21.75 9.75 9.75 0 1118.748 2.248 7.5 7.5 0 0021.752 15z" />
              </svg>
            </button>

            <NotificationsDropdown v-if="!isDesktopViewport" />

            <button type="button"
              class="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
              @click="toggleMobileSidebar" aria-label="切换菜单">
              <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <header v-if="!hideHeader" class="shrink-0 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div class="flex items-center gap-2">
              <h1 class="text-3xl font-semibold tracking-tight text-slate-950">
                {{ title }}
              </h1>
              <InfoTooltip v-if="titleTooltip" :text="titleTooltip" />
            </div>
            <p v-if="description" class="mt-2 max-w-3xl text-sm leading-7 text-slate-500">
              {{ description }}
            </p>
          </div>

          <div class="flex items-center justify-end gap-4">
            <div v-if="$slots['header-actions']" class="flex flex-wrap gap-2">
              <slot name="header-actions" />
            </div>

            <button type="button"
              class="hidden h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 lg:inline-flex"
              :aria-label="isDarkTheme ? '切换到浅色模式' : '切换到深色模式'" @click="toggleThemeMode">
              <svg v-if="isDarkTheme" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"
                stroke-width="1.8">
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M12 3v1.5m0 15V21m9-9h-1.5M4.5 12H3m15.364 6.364l-1.06-1.06M6.696 6.696l-1.06-1.06m12.728 0l-1.06 1.06M6.696 17.304l-1.06 1.06M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
              </svg>
              <svg v-else class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
                <path stroke-linecap="round" stroke-linejoin="round"
                  d="M21.752 15.002A9.718 9.718 0 0112 21.75 9.75 9.75 0 1118.748 2.248 7.5 7.5 0 0021.752 15z" />
              </svg>
            </button>

            <NotificationsDropdown v-if="isDesktopViewport" />
          </div>
        </div>
      </header>

      <section class="flex-1 lg:min-h-0 lg:overflow-y-auto">
        <div :class="contentClass">
          <slot />
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DashboardSidebar from '@/components/DashboardSidebar.vue'
import InfoTooltip from '@/components/InfoTooltip.vue'
import NotificationsDropdown from '@/components/NotificationsDropdown.vue'
import SiteBrand from '@/components/SiteBrand.vue'
import { useAuthStore } from '@/stores/auth'
import { useSiteSettingsStore } from '@/stores/siteSettings'
import { useThemeMode } from '@/utils/theme'

defineProps({
  title: {
    type: String,
    default: ''
  },
  titleTooltip: {
    type: String,
    default: ''
  },
  description: {
    type: String,
    default: ''
  },
  hideHeader: {
    type: Boolean,
    default: false
  },
  contentClass: {
    type: String,
    default: 'px-4 py-5 sm:px-6'
  }
})

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const siteSettingsStore = useSiteSettingsStore()
const { isDarkTheme, toggleThemeMode } = useThemeMode()
const desktopMediaQuery = window.matchMedia('(min-width: 1024px)')
const isMobileSidebarOpen = ref(false)
const isDesktopViewport = ref(desktopMediaQuery.matches)

const navItems = computed(() => {
  const items = [
    {
      to: '/dashboard',
      label: '仪表盘',
      icon: 'M3.75 12h16.5M12 3.75v16.5'
    },
    {
      to: '/materials',
      label: '课件资料',
      startsWith: true,
      icon: 'M19.5 14.25v-8.625a1.125 1.125 0 00-1.125-1.125H8.62a1.125 1.125 0 00-.796.33L4.08 8.574a1.125 1.125 0 00-.33.796v8.88a1.125 1.125 0 001.125 1.125h13.5A1.125 1.125 0 0019.5 18.25z'
    },
    {
      to: '/assignments',
      label: '作业管理',
      startsWith: true,
      icon: 'M9 5.25h6M9 9.75h6M9 14.25h3.75M6.75 3.75h10.5A2.25 2.25 0 0119.5 6v12a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 18V6a2.25 2.25 0 012.25-2.25z'
    },
    {
      to: '/posts',
      label: '讨论区',
      startsWith: true,
      icon: 'M7.5 8.25h9m-9 3h6m-9 8.25l1.56-3.12a8.97 8.97 0 01-1.12-4.38c0-4.97 4.03-9 9-9s9 4.03 9 9-4.03 9-9 9a8.97 8.97 0 01-4.38-1.12L4.5 19.5z'
    }
  ]

  if (authStore.isTeacher) {
    items.push({
      to: '/admin/users',
      label: '用户管理',
      startsWith: true,
      icon: 'M18 18.75a3 3 0 00-3-3h-6a3 3 0 00-3 3m12 0v.75A2.25 2.25 0 0115.75 21h-7.5A2.25 2.25 0 016 19.5v-.75m12 0a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.211-1.01-.586-1.364l-1.828-1.724M6 18.75a2.25 2.25 0 01-2.25-2.25v-1.372c0-.516.211-1.01.586-1.364l1.828-1.724M15 7.5a3 3 0 11-6 0 3 3 0 016 0z'
    })
  }

  if (authStore.isAdmin) {
    items.push({
      to: '/admin/settings',
      label: '站点设置',
      startsWith: true,
      icon: 'M10.5 6h3m-7.5 6h10.5m-10.5 6h10.5M4.5 5.25h15A2.25 2.25 0 0121.75 7.5v9A2.25 2.25 0 0119.5 18.75h-15A2.25 2.25 0 012.25 16.5v-9A2.25 2.25 0 014.5 5.25z'
    })
  }

  items.push({
    to: '/profile',
    label: '个人信息',
    icon: 'M15.75 6.75a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.25a8.25 8.25 0 0114.998 0'
  })

  return items
})

function handleLogout() {
  closeMobileSidebar()
  authStore.logout()
  router.push('/login')
}

function closeMobileSidebar() {
  isMobileSidebarOpen.value = false
}

function toggleMobileSidebar() {
  isMobileSidebarOpen.value = !isMobileSidebarOpen.value
}

function syncShellScrollLock() {
  document.body.classList.toggle('app-shell-lock', desktopMediaQuery.matches)
}

function syncMobileSidebarLock() {
  const shouldLock = isMobileSidebarOpen.value && !desktopMediaQuery.matches
  document.body.classList.toggle('app-mobile-nav-lock', shouldLock)
}

function handleViewportChange() {
  isDesktopViewport.value = desktopMediaQuery.matches
  syncShellScrollLock()

  if (desktopMediaQuery.matches) {
    closeMobileSidebar()
  }

  syncMobileSidebarLock()
}

watch(
  () => route.fullPath,
  () => {
    closeMobileSidebar()
  }
)

watch(isMobileSidebarOpen, () => {
  syncMobileSidebarLock()
})

onMounted(() => {
  handleViewportChange()
  desktopMediaQuery.addEventListener('change', handleViewportChange)
})

onBeforeUnmount(() => {
  desktopMediaQuery.removeEventListener('change', handleViewportChange)
  document.body.classList.remove('app-shell-lock')
  document.body.classList.remove('app-mobile-nav-lock')
})
</script>
