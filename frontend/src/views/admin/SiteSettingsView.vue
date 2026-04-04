<template>
  <AppShell title="站点设置">
    <template #header-actions>
      <button type="button" class="ui-button-primary min-w-[108px]" :disabled="isLoading || isSaving || isUploadingLogo"
        @click="saveSettings">
        {{ isSaving ? '保存中...' : '保存设置' }}
      </button>
    </template>

    <div class="mx-auto max-w-[92rem] space-y-4">
      <p v-if="pageError" class="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">
        {{ pageError }}
      </p>

      <section v-if="isLoading" class="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-500">
        正在加载站点设置...
      </section>

      <template v-else>
        <section class="grid gap-4 xl:grid-cols-[minmax(0,1fr),320px] xl:items-start">
          <div class="space-y-4">
            <article v-for="section in sections" :key="section.key"
              class="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <div class="flex items-center gap-2">
                <h2 class="text-base font-semibold text-slate-950">
                  {{ section.title }}
                </h2>
                <InfoTooltip v-if="section.tooltip" :text="section.tooltip" />
              </div>

              <div class="mt-4 grid gap-3 sm:grid-cols-2">
                <template v-for="field in section.fields" :key="field.key">
                  <div v-if="field.type === 'boolean'"
                    class="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3"
                    :class="field.wide ? 'sm:col-span-2' : ''">
                    <label class="flex cursor-pointer items-center justify-between gap-3">
                      <span class="min-w-0">
                        <span class="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                          <span>{{ field.label }}</span>
                          <InfoTooltip v-if="field.hint" :text="field.hint" />
                        </span>
                      </span>

                      <input v-model="form[field.key]" type="checkbox" class="sr-only" true-value="1" false-value="0">
                      <span class="relative inline-flex h-6 w-11 shrink-0 rounded-full transition">
                        <span class="absolute inset-0 rounded-full transition"
                          :class="form[field.key] === '1' ? 'bg-slate-900' : 'bg-slate-300'" />
                        <span class="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition"
                          :class="form[field.key] === '1' ? 'translate-x-5' : 'translate-x-0'" />
                      </span>
                    </label>
                  </div>

                  <label v-else class="block" :class="field.wide ? 'sm:col-span-2' : ''">
                    <span class="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                      <span>{{ field.label }}</span>
                      <InfoTooltip v-if="field.hint" :text="field.hint" />
                    </span>

                    <textarea v-if="field.type === 'textarea'" :ref="(element) => bindTextareaRef(field.key, element)"
                      v-model="form[field.key]" :rows="field.rows || 4"
                      class="ui-input min-h-[104px] resize-none overflow-hidden" :placeholder="field.placeholder"
                      style="resize: none;" @input="handleTextareaInput" />

                    <input v-else v-model="form[field.key]" :type="field.type || 'text'" class="ui-input"
                      :placeholder="field.placeholder" :min="field.min" :max="field.max" :step="field.step || 1">
                  </label>
                </template>
              </div>

              <div v-if="section.key === 'brand'" class="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div class="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div
                    class="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-900 text-lg font-semibold text-white">
                    <img v-if="siteLogoPreviewUrl" :src="siteLogoPreviewUrl" alt="站点 Logo 预览"
                      class="h-full w-full object-cover">
                    <span v-else>{{ previewLogoText }}</span>
                  </div>

                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5">
                      <p class="text-sm font-semibold text-slate-950">
                        站点 Logo
                      </p>
                      <InfoTooltip text="支持 PNG、JPG、WEBP、GIF。上传后会自动写入 Logo 地址，并立即用于首页、登录页和后台侧栏。" />
                    </div>
                    <p class="mt-1 text-xs text-slate-500">
                      {{ siteLogoPreviewUrl ? '当前使用图片 Logo' : '当前使用文字 Logo' }}
                    </p>

                    <div class="mt-3 flex flex-wrap gap-2">
                      <label class="ui-button-secondary cursor-pointer px-3.5 py-2"
                        :class="isUploadingLogo ? 'pointer-events-none opacity-60' : ''">
                        <input class="sr-only" type="file" accept="image/png,image/jpeg,image/webp,image/gif"
                          :disabled="isUploadingLogo" @change="handleSiteLogoSelected">
                        {{ isUploadingLogo ? '上传中...' : '上传 Logo' }}
                      </label>

                      <button type="button" class="ui-button-secondary px-3.5 py-2"
                        :disabled="isUploadingLogo || !form.site_logo_url" @click="clearLogoUrl">
                        清空地址
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="section.key === 'storage'"
                class="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
                免费版 R2 总容量上限约为 {{ FREE_TIER_STORAGE_QUOTA_MB.toLocaleString('zh-CN') }} MB（约 10 GB）。
                建议优先填写该值，若业务需要再按实际预算调整。
              </div>
            </article>
          </div>

          <aside class="space-y-4">
            <section class="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <h2 class="text-base font-semibold text-slate-950">
                预览
              </h2>

              <div class="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <SiteBrand :title="form.site_name" :logo-text="form.site_logo_text" :logo-url="form.site_logo_url" />

                <div class="mt-4 grid gap-2">
                  <div v-for="item in previewSummaryItems" :key="item.label"
                    class="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                    <span class="text-slate-500">{{ item.label }}</span>
                    <span class="font-medium text-slate-950">{{ item.value }}</span>
                  </div>
                </div>

                <div class="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                  <p class="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                    首页预览
                  </p>
                  <h3 class="mt-3 text-lg font-semibold text-slate-950">
                    {{ form.homepage_title }}
                  </h3>
                  <p class="mt-2 text-sm leading-6 text-slate-500">
                    {{ form.homepage_description }}
                  </p>

                  <div class="mt-4 flex flex-wrap gap-2">
                    <span class="ui-button-primary pointer-events-none px-3.5 py-2">
                      {{ form.homepage_primary_label }}
                    </span>
                    <span class="ui-button-secondary pointer-events-none px-3.5 py-2">
                      {{ form.homepage_secondary_label }}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section class="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <div class="flex items-center justify-between gap-3">
                <h2 class="text-base font-semibold text-slate-950">
                  最近变更
                </h2>
                <span class="text-xs text-slate-400">{{ auditLogs.length }} 条</span>
              </div>

              <div v-if="auditLogs.length === 0"
                class="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                暂无变更记录
              </div>

              <div v-else class="mt-4 space-y-2.5">
                <article v-for="log in auditLogs" :key="log.id"
                  class="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
                  <div class="flex items-start justify-between gap-3">
                    <p class="text-sm font-medium text-slate-900">
                      {{ log.summary }}
                    </p>
                    <span class="shrink-0 text-xs text-slate-500">
                      {{ formatDateTime(log.created_at) }}
                    </span>
                  </div>
                  <p class="mt-1 text-xs text-slate-500">
                    {{ log.actor_name || '系统' }}
                  </p>
                </article>
              </div>
            </section>
          </aside>
        </section>
      </template>
    </div>
  </AppShell>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import AppShell from '@/components/AppShell.vue'
import InfoTooltip from '@/components/InfoTooltip.vue'
import SiteBrand from '@/components/SiteBrand.vue'
import { defaultSiteSettings, useSiteSettingsStore } from '@/stores/siteSettings'
import api, { resolveAssetUrl } from '@/utils/api'

const siteSettingsStore = useSiteSettingsStore()
const FREE_TIER_STORAGE_QUOTA_MB = 10240
const STORAGE_QUOTA_MIN_MB = 100
const STORAGE_QUOTA_MAX_MB = 1024 * 1024

const sections = [
  {
    key: 'brand',
    title: '品牌信息',
    tooltip: '控制页面中展示的站点全称、Logo 和基础说明。',
    fields: [
      {
        key: 'site_name',
        label: '网站全称',
        placeholder: '请输入站点名称'
      },
      {
        key: 'site_logo_text',
        label: 'Logo 文字',
        placeholder: '课',
        hint: '未设置图片 Logo 时显示。'
      },
      {
        key: 'site_logo_url',
        label: 'Logo 地址',
        placeholder: 'https://example.com/logo.png 或站内地址',
        hint: '可以直接填写外部图片地址。'
      },
      {
        key: 'site_description',
        label: '网站简介',
        placeholder: '用于浏览器描述和部分页面说明。',
        type: 'textarea',
        rows: 4,
        wide: true
      }
    ]
  },
  {
    key: 'homepage',
    title: '首页文案',
    tooltip: '控制首页主标题、说明和两个入口按钮文案。',
    fields: [
      {
        key: 'homepage_title',
        label: '首页主标题',
        placeholder: '在线课程学习平台',
        wide: true
      },
      {
        key: 'homepage_description',
        label: '首页说明',
        placeholder: '介绍网站定位和核心功能。',
        type: 'textarea',
        rows: 5,
        wide: true
      },
      {
        key: 'homepage_primary_label',
        label: '主按钮文案',
        placeholder: '立即使用'
      },
      {
        key: 'homepage_secondary_label',
        label: '次按钮文案',
        placeholder: '已有账号登录'
      }
    ]
  },
  {
    key: 'auth',
    title: '登录与注册',
    tooltip: '控制登录页、注册页文案，以及是否允许公开注册。',
    fields: [
      {
        key: 'login_title',
        label: '登录页标题',
        placeholder: '登录'
      },
      {
        key: 'login_description',
        label: '登录页说明',
        placeholder: '使用账号或学号进入课程后台'
      },
      {
        key: 'registration_enabled',
        label: '开放用户注册',
        type: 'boolean',
        wide: true,
        hint: '关闭后会隐藏首页和登录页的注册入口，直接访问注册地址也无法完成注册。'
      },
      {
        key: 'register_title',
        label: '注册页标题',
        placeholder: '注册'
      },
      {
        key: 'register_description',
        label: '注册页说明',
        placeholder: '创建属于你的课程账号'
      }
    ]
  },
  {
    key: 'security',
    title: '跨域来源',
    tooltip: '默认自动允许 pages.dev。若你新增独立前端域名，可在此补充允许来源。',
    fields: [
      {
        key: 'allowed_origins',
        label: '自定义允许来源',
        placeholder: 'https://www.example.com\nhttps://app.example.com\nhttps://*.pages.dev',
        type: 'textarea',
        rows: 4,
        wide: true,
        hint: '支持逗号或换行分隔，仅支持域名级地址（不含路径）。'
      }
    ]
  },
  {
    key: 'storage',
    title: '存储容量',
    tooltip: '设置全站上传资源的总容量上限，超过后将拒绝继续上传。',
    fields: [
      {
        key: 'storage_quota_mb',
        label: '资源容量上限 (MB)',
        type: 'number',
        placeholder: '10240',
        min: STORAGE_QUOTA_MIN_MB,
        max: STORAGE_QUOTA_MAX_MB,
        step: 1,
        hint: '默认 10240 MB（约 10 GB，R2 免费容量参考值）。'
      }
    ]
  }
]

const form = ref({ ...defaultSiteSettings })
const auditLogs = ref([])
const isLoading = ref(false)
const isSaving = ref(false)
const isUploadingLogo = ref(false)
const pageError = ref('')
const textareaRefs = new Map()

const siteLogoPreviewUrl = computed(() => resolveAssetUrl(form.value.site_logo_url || ''))
const previewLogoText = computed(() => {
  const source = `${form.value.site_logo_text || form.value.site_name || '站'}`.trim()
  return source.slice(0, 2).toUpperCase() || '站'
})
const registrationEnabled = computed(() => form.value.registration_enabled === '1')
const normalizedStorageQuotaMb = computed(() => {
  const parsed = Number.parseInt(`${form.value.storage_quota_mb || ''}`.trim(), 10)

  if (!Number.isFinite(parsed)) {
    return FREE_TIER_STORAGE_QUOTA_MB
  }

  return Math.min(STORAGE_QUOTA_MAX_MB, Math.max(STORAGE_QUOTA_MIN_MB, parsed))
})

const storageQuotaDisplay = computed(() => `${normalizedStorageQuotaMb.value.toLocaleString('zh-CN')} MB`)
const previewSummaryItems = computed(() => [
  {
    label: '站点名称',
    value: form.value.site_name || '未设置'
  },
  {
    label: '注册',
    value: registrationEnabled.value ? '开放' : '关闭'
  },
  {
    label: '容量上限',
    value: storageQuotaDisplay.value
  }
])

function syncSettings(settings) {
  const mergedSettings = {
    ...defaultSiteSettings,
    ...(settings || {})
  }

  form.value = mergedSettings
  siteSettingsStore.$patch({
    adminSettings: mergedSettings,
    publicSettings: mergedSettings,
    hasLoadedPublic: true
  })

  nextTick(resizeAllTextareas)
}

function formatDateTime(value) {
  if (!value) return '暂无记录'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '暂无记录'

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(parsed)
}

function clearLogoUrl() {
  form.value.site_logo_url = ''
}

function bindTextareaRef(key, element) {
  if (element) {
    textareaRefs.set(key, element)
    resizeTextareaElement(element)
    return
  }

  textareaRefs.delete(key)
}

function resizeTextareaElement(element) {
  if (!element) {
    return
  }

  element.style.height = '0px'
  element.style.height = `${Math.max(element.scrollHeight, 104)}px`
}

function handleTextareaInput(event) {
  resizeTextareaElement(event?.target)
}

function resizeAllTextareas() {
  textareaRefs.forEach((element) => {
    resizeTextareaElement(element)
  })
}

async function loadAuditLogs() {
  const response = await api.get('/settings/audit-logs?limit=7')
  auditLogs.value = response.logs || []
}

async function loadPage() {
  isLoading.value = true
  pageError.value = ''

  try {
    const settings = await siteSettingsStore.loadAdminSettings()
    syncSettings(settings)
    await loadAuditLogs()
  } catch (error) {
    pageError.value = error?.error || error?.message || '加载站点设置失败'
  } finally {
    isLoading.value = false
  }
}

async function handleSiteLogoSelected(event) {
  const file = event.target.files?.[0]
  event.target.value = ''

  if (!file) {
    return
  }

  isUploadingLogo.value = true
  pageError.value = ''

  try {
    const formData = new FormData()
    formData.append('file', file)

    const response = await api.post('/settings/assets/site-logo', formData)
    syncSettings(response.settings)
    await loadAuditLogs()
  } catch (error) {
    pageError.value = error?.error || error?.message || '上传站点 Logo 失败'
  } finally {
    isUploadingLogo.value = false
  }
}

async function saveSettings() {
  isSaving.value = true
  pageError.value = ''

  try {
    const parsedStorageQuotaMb = Number.parseInt(`${form.value.storage_quota_mb || ''}`.trim(), 10)
    if (!Number.isFinite(parsedStorageQuotaMb)) {
      pageError.value = '资源容量上限必须是整数（MB）'
      return
    }

    if (parsedStorageQuotaMb < STORAGE_QUOTA_MIN_MB || parsedStorageQuotaMb > STORAGE_QUOTA_MAX_MB) {
      pageError.value = `资源容量上限需在 ${STORAGE_QUOTA_MIN_MB} 到 ${STORAGE_QUOTA_MAX_MB} MB 之间`
      return
    }

    form.value.storage_quota_mb = `${parsedStorageQuotaMb}`

    const response = await siteSettingsStore.saveAdminSettings(form.value)
    syncSettings(response.settings)
    await loadAuditLogs()
  } catch (error) {
    pageError.value = error?.error || error?.message || '保存站点设置失败'
  } finally {
    isSaving.value = false
  }
}

onMounted(() => {
  loadPage()
})
</script>
