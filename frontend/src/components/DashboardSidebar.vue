<template>
  <aside
    class="fixed inset-y-0 left-0 z-50 w-[85vw] max-w-xs border-r border-slate-200 bg-white transition-transform duration-200 ease-out lg:static lg:min-h-screen lg:w-auto lg:max-w-none lg:border-b-0 lg:translate-x-0"
    :class="mobileOpen ? 'translate-x-0' : '-translate-x-full'">
    <div class="flex h-full flex-col">
      <div class="border-b border-slate-200 px-4 py-4 sm:px-5">
        <div class="flex items-center justify-between gap-3">
          <SiteBrand link-to="/dashboard" :title="settings.site_name" :logo-text="settings.site_logo_text"
            :logo-url="settings.site_logo_url" @click="handleNavClick" />

          <button type="button"
            class="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 lg:hidden"
            @click="emit('close-mobile')" aria-label="收起菜单">
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="mt-4 flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-3">
          <div v-if="avatarUrl" class="h-10 w-10 overflow-hidden rounded-full border border-slate-200 bg-white">
            <img :src="avatarUrl" :alt="displayName" class="h-full w-full object-cover" />
          </div>
          <div v-else
            class="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
            {{ userInitial }}
          </div>
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold text-slate-950">
              {{ displayName }}
            </p>
            <p class="text-xs text-slate-500">
              {{ roleLabel }}
            </p>
          </div>
        </div>
      </div>

      <div class="flex-1 p-3">
        <p class="px-3 pb-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
          导航
        </p>
        <nav class="space-y-1">
          <router-link v-for="item in navItems" :key="item.to" :to="item.to" @click="handleNavClick"
            class="flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition"
            :class="isActive(item) ? 'bg-slate-100 text-slate-950' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border"
              :class="isActive(item) ? 'border-slate-200 bg-white text-slate-900' : 'border-transparent bg-slate-50 text-slate-500'">
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" :d="item.icon" />
              </svg>
            </span>
            <span>{{ item.label }}</span>
          </router-link>
        </nav>
      </div>

      <div class="border-t border-slate-200 p-3">
        <button type="button"
          class="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium text-rose-500 transition hover:bg-rose-50 hover:text-rose-600"
          @click="handleLogoutClick">
          <span class="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 text-rose-500">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"
                d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6A2.25 2.25 0 005.25 5.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"
                d="M18 12H9.75m0 0l2.625-2.625M9.75 12l2.625 2.625" />
            </svg>
          </span>
          <span>退出登录</span>
        </button>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import SiteBrand from '@/components/SiteBrand.vue'
import { useSiteSettingsStore } from '@/stores/siteSettings'
import { resolveAssetUrl } from '@/utils/api'

const props = defineProps({
  user: {
    type: Object,
    default: null
  },
  navItems: {
    type: Array,
    default: () => []
  },
  mobileOpen: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['logout', 'close-mobile'])

const route = useRoute()
const siteSettingsStore = useSiteSettingsStore()

const settings = computed(() => siteSettingsStore.publicSettings)
const displayName = computed(() => props.user?.real_name || props.user?.username || '未命名用户')
const userInitial = computed(() => displayName.value.trim().charAt(0) || 'U')
const avatarUrl = computed(() => resolveAssetUrl(props.user?.avatar_url || ''))
const roleLabel = computed(() => {
  if (props.user?.role === 'admin') return '管理员'
  if (props.user?.role === 'teacher') return '教师'
  if (props.user?.role === 'student') return '学生'
  return '访客'
})

function isActive(item) {
  return item.startsWith ? route.path.startsWith(item.to) : route.path === item.to
}

function handleNavClick() {
  if (props.mobileOpen) {
    emit('close-mobile')
  }
}

function handleLogoutClick() {
  emit('logout')
  emit('close-mobile')
}
</script>
