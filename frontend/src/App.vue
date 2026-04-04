<template>
  <router-view />
</template>

<script setup>
import { onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useSiteSettingsStore } from '@/stores/siteSettings'
import { initThemeMode } from '@/utils/theme'

const route = useRoute()
const authStore = useAuthStore()
const siteSettingsStore = useSiteSettingsStore()

const routeTitleMap = {
  Landing: '首页',
  Dashboard: '仪表盘',
  Login: '登录',
  Register: '注册',
  InstallSetup: '首次安装',
  Materials: '课件资料',
  Assignments: '作业管理',
  AssignmentDetail: '作业详情',
  Posts: '讨论区',
  PostDetail: '讨论详情',
  Profile: '个人信息',
  UserManagement: '用户管理',
  UserCreate: '新建账号',
  UserBatchCreate: '批量建号',
  UserEdit: '编辑账号',
  SiteSettings: '站点设置'
}

function updateDocumentMeta() {
  const configuredSiteName = `${siteSettingsStore.publicSettings.site_name || ''}`.trim()
  const fallbackSiteName = '课程平台'
  const brandName = configuredSiteName || fallbackSiteName
  const pageTitle = route.meta?.pageTitle || routeTitleMap[route.name] || ''

  document.title = pageTitle ? `${pageTitle} | ${brandName}` : brandName

  let metaDescription = document.querySelector('meta[name="description"]')
  if (!metaDescription) {
    metaDescription = document.createElement('meta')
    metaDescription.setAttribute('name', 'description')
    document.head.appendChild(metaDescription)
  }

  metaDescription.setAttribute(
    'content',
    siteSettingsStore.publicSettings.site_description || brandName
  )
}

onMounted(() => {
  initThemeMode()
  siteSettingsStore.loadPublicSettings().catch(() => null)
  authStore.checkAuth()
})

watch(
  () => [
    route.name,
    route.meta?.pageTitle,
    siteSettingsStore.publicSettings.site_name,
    siteSettingsStore.publicSettings.site_description
  ],
  updateDocumentMeta,
  { immediate: true }
)
</script>
