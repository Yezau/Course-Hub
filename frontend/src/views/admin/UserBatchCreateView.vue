<template>
  <AppShell title="批量新建学生账号">
    <template #header-actions>
      <router-link to="/admin/users"
        class="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950">
        返回列表
      </router-link>
      <router-link v-if="authStore.isAdmin" to="/admin/users/new"
        class="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950">
        单个新建
      </router-link>
    </template>

    <div class="mx-auto max-w-7xl space-y-4">
      <p v-if="pageError" class="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">
        {{ pageError }}
      </p>

      <section class="grid gap-4 xl:grid-cols-[minmax(0,1.45fr),400px]">
        <form class="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" @submit.prevent="submitBatchCreate">
          <h2 class="text-base font-semibold text-slate-950">批量参数</h2>

          <div class="mt-4 grid gap-3 sm:grid-cols-2">
            <label class="block">
              <span class="mb-1.5 block text-sm font-medium text-slate-700">学号前缀</span>
              <input v-model.trim="form.student_id_prefix" type="text" required placeholder="例如 223050"
                class="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-950 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100" />
            </label>

            <label class="block">
              <span class="mb-1.5 block text-sm font-medium text-slate-700">起始序号</span>
              <input v-model.number="form.start_number" type="number" min="0" required
                class="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-950 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100" />
            </label>

            <label class="block">
              <span class="mb-1.5 block text-sm font-medium text-slate-700">创建数量</span>
              <input v-model.number="form.count" type="number" min="1" max="200" required
                class="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-950 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100" />
            </label>

            <label class="block">
              <span class="mb-1.5 block text-sm font-medium text-slate-700">补零位数</span>
              <input v-model.number="form.suffix_length" type="number" min="1" max="12" required
                class="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-950 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100" />
            </label>

            <label class="block">
              <span class="mb-1.5 block text-sm font-medium text-slate-700">默认密码</span>
              <input v-model="form.default_password" type="password" required placeholder="至少 6 位"
                class="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-950 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100" />
            </label>

            <label class="block">
              <span class="mb-1.5 block text-sm font-medium text-slate-700">邮箱域名</span>
              <input v-model.trim="form.email_domain" type="text" placeholder="选填，例如 students.local"
                class="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-950 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100" />
            </label>

            <label class="block">
              <span class="mb-1.5 block text-sm font-medium text-slate-700">姓名前缀</span>
              <input v-model.trim="form.real_name_prefix" type="text" placeholder="例如 学生"
                class="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-950 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100" />
            </label>

            <label class="block">
              <span class="mb-1.5 block text-sm font-medium text-slate-700">头像地址</span>
              <input v-model.trim="form.avatar_url" type="text" placeholder="选填"
                class="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-950 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100" />
            </label>
          </div>

          <p v-if="resultMessage" class="mt-4 rounded-xl px-3.5 py-2.5 text-sm"
            :class="resultState === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'">
            {{ resultMessage }}
          </p>

          <div class="mt-4 flex flex-wrap gap-2">
            <button type="submit" :disabled="isSubmitting"
              class="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">
              {{ isSubmitting ? '批量创建中...' : '开始批量创建' }}
            </button>
            <button type="button"
              class="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
              @click="clearResult">
              清空结果
            </button>
          </div>

          <div v-if="createProgress.visible" class="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
            <div class="flex items-center justify-between gap-3 text-xs text-slate-600">
              <span>批量新增进度：{{ createProgress.processed }} / {{ createProgress.total }}</span>
              <span>批次 {{ createProgress.completedChunks }} / {{ createProgress.totalChunks }}</span>
            </div>
            <div class="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div class="h-full rounded-full bg-slate-900 transition-all duration-300"
                :style="{ width: `${createProgressPercent}%` }"></div>
            </div>
          </div>
        </form>

        <aside class="space-y-4">
          <section class="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 class="text-base font-semibold text-slate-950">生成预览</h2>

            <div class="mt-4 grid gap-2">
              <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                <span class="text-slate-500">首个学号</span>
                <span class="ml-2 font-semibold text-slate-950">{{ previewFirstStudentId }}</span>
              </div>
              <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                <span class="text-slate-500">最后学号</span>
                <span class="ml-2 font-semibold text-slate-950">{{ previewLastStudentId }}</span>
              </div>
            </div>

            <div class="mt-4 overflow-hidden rounded-xl border border-slate-200">
              <div
                class="grid grid-cols-[1.15fr,1.15fr,1.85fr] gap-3 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                <span>学号</span>
                <span>用户名</span>
                <span>邮箱</span>
              </div>
              <div v-for="sample in previewSamples" :key="sample.studentId"
                class="grid grid-cols-[1.15fr,1.15fr,1.85fr] gap-3 border-t border-slate-200 px-3 py-2 text-xs text-slate-700 first:border-t-0">
                <span>{{ sample.studentId }}</span>
                <span>{{ sample.username }}</span>
                <span class="break-all">{{ sample.email || '未设置' }}</span>
              </div>
            </div>
          </section>

          <section class="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 class="text-base font-semibold text-slate-950">执行结果</h2>

            <div v-if="!batchResult"
              class="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
              批量创建完成后，这里会显示结果摘要和明细。
            </div>

            <div v-else class="mt-4 space-y-3">
              <div class="flex flex-wrap gap-2">
                <div
                  class="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <span class="text-slate-500">成功</span>
                  <span class="font-semibold text-slate-950">{{ batchResult.created_count }}</span>
                </div>
                <div
                  class="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <span class="text-slate-500">跳过</span>
                  <span class="font-semibold text-slate-950">{{ batchResult.skipped_count }}</span>
                </div>
              </div>

              <div v-if="batchResult.created_users?.length"
                class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <p class="text-sm font-medium text-slate-500">已创建账号</p>
                <div class="mt-2 max-h-48 space-y-1.5 overflow-y-auto text-xs text-slate-700">
                  <p v-for="user in batchResult.created_users" :key="user.id">
                    {{ user.username }}<template v-if="user.email"> · {{ user.email }}</template>
                  </p>
                </div>
              </div>

              <div v-if="batchResult.skipped?.length" class="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
                <p class="text-sm font-medium text-amber-700">跳过明细</p>
                <div class="mt-2 max-h-48 space-y-1.5 overflow-y-auto text-xs text-amber-800">
                  <p v-for="item in batchResult.skipped" :key="item.student_id">
                    {{ item.student_id }} · {{ item.reason }}
                  </p>
                </div>
              </div>
            </div>
          </section>
        </aside>
      </section>
    </div>
  </AppShell>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import { useAuthStore } from '@/stores/auth'
import api from '@/utils/api'

const authStore = useAuthStore()
const router = useRouter()

const isSubmitting = ref(false)
const pageError = ref('')
const resultMessage = ref('')
const resultState = ref('success')
const batchResult = ref(null)
const createProgress = reactive({
  visible: false,
  total: 0,
  processed: 0,
  totalChunks: 0,
  completedChunks: 0
})
const BATCH_CREATE_REQUEST_CHUNK_SIZE = 50

const form = reactive({
  student_id_prefix: '',
  start_number: 1,
  count: 10,
  suffix_length: 3,
  default_password: 'student123',
  email_domain: '',
  real_name_prefix: '学生',
  avatar_url: ''
})

function normalizePositiveInteger(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function buildStudentId(index) {
  const prefix = form.student_id_prefix.trim()
  const suffixLength = Math.max(1, normalizePositiveInteger(form.suffix_length, 3))
  const suffix = String(index).padStart(suffixLength, '0')

  return prefix ? `${prefix}${suffix}` : `前缀${suffix}`
}

const previewFirstStudentId = computed(() => buildStudentId(normalizePositiveInteger(form.start_number, 0)))
const previewLastStudentId = computed(() => {
  const startNumber = normalizePositiveInteger(form.start_number, 0)
  const count = Math.max(1, normalizePositiveInteger(form.count, 1))
  return buildStudentId(startNumber + count - 1)
})

const previewSamples = computed(() => {
  const startNumber = normalizePositiveInteger(form.start_number, 0)
  const count = Math.max(1, normalizePositiveInteger(form.count, 1))
  const sampleSize = Math.min(count, 5)
  const emailDomain = form.email_domain.trim().replace(/^@+/, '')

  return Array.from({ length: sampleSize }, (_, offset) => {
    const studentId = buildStudentId(startNumber + offset)
    return {
      studentId,
      username: studentId,
      email: emailDomain ? `${studentId}@${emailDomain}` : null
    }
  })
})

function clearResult() {
  pageError.value = ''
  resultMessage.value = ''
  resultState.value = 'success'
  batchResult.value = null
  createProgress.visible = false
  createProgress.total = 0
  createProgress.processed = 0
  createProgress.totalChunks = 0
  createProgress.completedChunks = 0
}

const createProgressPercent = computed(() => {
  if (!createProgress.total) {
    return 0
  }

  return Math.min(100, Math.round((createProgress.processed / createProgress.total) * 100))
})

async function submitBatchCreate() {
  clearResult()

  if (!form.student_id_prefix.trim()) {
    resultState.value = 'error'
    resultMessage.value = '学号前缀不能为空'
    return
  }

  if (normalizePositiveInteger(form.count, 0) < 1) {
    resultState.value = 'error'
    resultMessage.value = '创建数量必须大于 0'
    return
  }

  if (normalizePositiveInteger(form.count, 0) > 200) {
    resultState.value = 'error'
    resultMessage.value = '单次最多可批量创建 200 个账号'
    return
  }

  if (normalizePositiveInteger(form.suffix_length, 0) < 1) {
    resultState.value = 'error'
    resultMessage.value = '补零位数必须大于 0'
    return
  }

  if ((form.default_password || '').length < 6) {
    resultState.value = 'error'
    resultMessage.value = '默认密码至少需要 6 位'
    return
  }

  isSubmitting.value = true

  try {
    const startNumber = normalizePositiveInteger(form.start_number, 0)
    const totalCount = normalizePositiveInteger(form.count, 1)
    const totalChunks = Math.max(1, Math.ceil(totalCount / BATCH_CREATE_REQUEST_CHUNK_SIZE))

    createProgress.visible = true
    createProgress.total = totalCount
    createProgress.processed = 0
    createProgress.totalChunks = totalChunks
    createProgress.completedChunks = 0

    const mergedCreatedUsers = []
    const mergedSkipped = []
    let failedError = null

    for (let offset = 0; offset < totalCount; offset += BATCH_CREATE_REQUEST_CHUNK_SIZE) {
      const chunkCount = Math.min(BATCH_CREATE_REQUEST_CHUNK_SIZE, totalCount - offset)

      try {
        const response = await api.post('/users/batch', {
          student_id_prefix: form.student_id_prefix,
          start_number: startNumber + offset,
          count: chunkCount,
          suffix_length: normalizePositiveInteger(form.suffix_length, 3),
          default_password: form.default_password,
          email_domain: form.email_domain,
          real_name_prefix: form.real_name_prefix,
          avatar_url: form.avatar_url
        }, {
          timeout: 120000
        })

        mergedCreatedUsers.push(...(response.created_users || []))
        mergedSkipped.push(...(response.skipped || []))
      } catch (chunkError) {
        failedError = chunkError
        break
      }

      createProgress.processed += chunkCount
      createProgress.completedChunks += 1
    }

    batchResult.value = {
      created_count: mergedCreatedUsers.length,
      skipped_count: mergedSkipped.length,
      created_users: mergedCreatedUsers,
      skipped: mergedSkipped
    }

    if (failedError) {
      resultState.value = 'error'
      resultMessage.value = `批量新增已完成 ${createProgress.processed}/${totalCount}，后续批次失败：${failedError?.error || failedError?.message || '请求失败'}`
      return
    }

    resultState.value = 'success'
    resultMessage.value = `批量创建完成，成功 ${mergedCreatedUsers.length} 个，跳过 ${mergedSkipped.length} 个`
  } catch (error) {
    console.error('批量创建失败:', error)
    resultState.value = 'error'
    resultMessage.value = error?.error || error?.message || '批量创建失败，请稍后重试'
  } finally {
    isSubmitting.value = false
  }
}

onMounted(() => {
  if (!authStore.isTeacher) {
    router.replace('/dashboard')
  }
})
</script>
