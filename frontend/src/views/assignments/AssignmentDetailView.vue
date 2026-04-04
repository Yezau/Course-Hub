<template>
  <AppShell :title="assignment?.title || '作业详情'" content-class="">
    <template #header-actions>
      <button class="ui-button-secondary" @click="router.push('/assignments')">返回列表</button>
      <button class="ui-button-secondary" @click="loadAssignmentDetail">刷新</button>
      <span
        v-if="assignment"
        class="inline-flex items-center rounded-full px-2.5 py-1.5 text-xs font-semibold leading-none"
        :class="getToneBadgeClass(assignmentState.tone)"
      >
        {{ assignmentState.label }}
      </span>
      <button
        v-if="authStore.isTeacher && assignment"
        class="rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
        :class="assignment.is_closed ? 'bg-emerald-600' : 'bg-rose-600'"
        @click="toggleAssignmentClosed"
      >
        {{ assignment.is_closed ? '重新开放' : '关闭作业' }}
      </button>
      <button
        v-if="authStore.isAdmin && assignment"
        class="rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
        @click="removeAssignment"
      >
        删除作业
      </button>
    </template>

    <main class="ui-page-compact max-w-6xl">
      <section
        v-if="notice.text"
        class="rounded-xl border px-4 py-3 text-sm"
        :class="notice.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'"
      >
        {{ notice.text }}
      </section>

      <section v-if="isLoading" class="ui-empty-state py-12">
        <div class="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-sky-600"></div>
        <p class="mt-3 text-sm text-slate-500">正在加载作业详情...</p>
      </section>

      <section v-else-if="!assignment" class="ui-empty-state py-12">
        <h1 class="text-lg font-semibold text-slate-900">作业不存在或已被移除</h1>
      </section>

      <div v-else class="space-y-4">
        <section class="ui-surface-compact">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span
                  class="inline-flex items-center self-center rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none"
                  :class="getToneBadgeClass(assignmentState.tone)"
                >
                  {{ assignmentState.label }}
                </span>
                <span
                  class="inline-flex items-center self-center whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium leading-none"
                  :class="relativeToneClass"
                >
                  {{ formatRelativeDeadline(assignment) }}
                </span>
                <span
                  v-if="authStore.isTeacher && (assignment.pending_grade_count || 0) > 0"
                  class="inline-flex items-center self-center whitespace-nowrap rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium leading-none text-amber-700"
                >
                  待批改 {{ assignment.pending_grade_count || 0 }} 份
                </span>
              </div>

              <h1 class="mt-3 text-2xl font-semibold text-slate-900">{{ assignment.title }}</h1>
              <p class="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">
                {{ assignment.description || '暂无更详细的作业说明。' }}
              </p>
            </div>
          </div>

          <div class="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div class="rounded-xl bg-slate-50 px-3 py-3">
              <p class="text-[11px] uppercase tracking-wide text-slate-500">作业期限</p>
              <p class="mt-1.5 text-sm font-medium text-slate-900">{{ formatAssignmentWindow(assignment) }}</p>
            </div>
            <div class="rounded-xl bg-slate-50 px-3 py-3">
              <p class="text-[11px] uppercase tracking-wide text-slate-500">提醒窗口</p>
              <p class="mt-1.5 text-sm font-medium text-slate-900">{{ assignment.reminder_hours || 72 }} 小时</p>
            </div>
            <div class="rounded-xl bg-slate-50 px-3 py-3">
              <p class="text-[11px] uppercase tracking-wide text-slate-500">总分</p>
              <p class="mt-1.5 text-sm font-medium text-slate-900">{{ assignment.total_score || 100 }} 分</p>
            </div>
            <div class="rounded-xl bg-slate-50 px-3 py-3">
              <p class="text-[11px] uppercase tracking-wide text-slate-500">发布者</p>
              <p class="mt-1.5 text-sm font-medium text-slate-900">{{ assignment.creator_name || '课程教师' }}</p>
            </div>
          </div>

          <div v-if="authStore.isTeacher" class="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div class="rounded-xl bg-slate-50 px-3 py-3">
              <p class="text-[11px] uppercase tracking-wide text-slate-500">提交数</p>
              <p class="mt-1.5 text-sm font-medium text-slate-900">{{ assignment.submission_count || 0 }}</p>
            </div>
            <div class="rounded-xl bg-slate-50 px-3 py-3">
              <p class="text-[11px] uppercase tracking-wide text-slate-500">待批改</p>
              <p class="mt-1.5 text-sm font-medium text-slate-900">{{ assignment.pending_grade_count || 0 }}</p>
            </div>
            <div class="rounded-xl bg-slate-50 px-3 py-3">
              <p class="text-[11px] uppercase tracking-wide text-slate-500">缺交人数</p>
              <p class="mt-1.5 text-sm font-medium text-slate-900">{{ assignment.missing_count || 0 }}</p>
            </div>
            <div class="rounded-xl bg-slate-50 px-3 py-3">
              <p class="text-[11px] uppercase tracking-wide text-slate-500">平均分</p>
              <p class="mt-1.5 text-sm font-medium text-slate-900">{{ assignment.avg_score ?? '暂无' }}</p>
            </div>
          </div>

          <div v-else class="mt-2 grid gap-2 sm:grid-cols-3">
            <div class="rounded-xl bg-slate-50 px-3 py-3">
              <p class="text-[11px] uppercase tracking-wide text-slate-500">提交时间</p>
              <p class="mt-1.5 text-sm font-medium text-slate-900">{{ formatDateTime(mySubmission?.submitted_at, '尚未提交') }}</p>
            </div>
            <div class="rounded-xl bg-slate-50 px-3 py-3">
              <p class="text-[11px] uppercase tracking-wide text-slate-500">当前得分</p>
              <p class="mt-1.5 text-sm font-medium text-slate-900">{{ mySubmission?.score ?? '待评分' }}</p>
            </div>
            <div class="rounded-xl bg-slate-50 px-3 py-3">
              <p class="text-[11px] uppercase tracking-wide text-slate-500">反馈状态</p>
              <p class="mt-1.5 text-sm font-medium text-slate-900">{{ mySubmission?.feedback ? '已有反馈' : '暂无反馈' }}</p>
            </div>
          </div>

          <div v-if="assignment.attachments?.length" class="mt-4 border-t border-slate-100 pt-3">
            <div class="flex items-center gap-1.5">
              <p class="text-sm font-medium text-slate-700">作业附件</p>
              <InfoTooltip text="教师上传的题目附件、实验指导书或模板文件可在这里下载。" />
            </div>
            <div class="mt-2 flex flex-wrap gap-1.5">
              <button
                v-for="attachment in assignment.attachments"
                :key="attachment.id"
                type="button"
                class="rounded-full bg-slate-100 px-2.5 py-1.5 text-[11px] font-medium text-slate-700"
                @click="downloadAssignmentAttachment(attachment)"
              >
                {{ attachment.name }} · {{ formatFileSize(attachment.size) }}
              </button>
            </div>
          </div>
        </section>

        <section v-if="authStore.isStudent" class="ui-surface-compact">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-1.5">
              <h2 class="text-lg font-semibold text-slate-900">提交与反馈</h2>
              <InfoTooltip text="重新选择新附件再提交时，系统会用这批新附件替换旧附件；只修改文本则保留原附件。" />
            </div>
            <span
              class="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none"
              :class="getToneBadgeClass(studentState.tone)"
            >
              {{ studentState.label }}
            </span>
          </div>

          <div v-if="mySubmission?.feedback" class="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p class="text-[11px] uppercase tracking-wide text-emerald-600">教师反馈</p>
            <p class="mt-2 whitespace-pre-line text-sm leading-6 text-emerald-800">{{ mySubmission.feedback }}</p>
          </div>

          <div v-if="mySubmission?.attachments?.length" class="mt-3 rounded-xl bg-slate-50 px-4 py-3">
            <div class="flex items-center gap-1.5">
              <p class="text-sm font-medium text-slate-700">已提交附件</p>
              <InfoTooltip text="这些是当前服务器中保存的提交附件。" />
            </div>
            <div class="mt-2 flex flex-wrap gap-1.5">
              <button
                v-for="attachment in mySubmission.attachments"
                :key="attachment.id"
                type="button"
                class="rounded-full bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700"
                @click="downloadSubmissionAttachment(mySubmission.id, attachment)"
              >
                {{ attachment.name }} · {{ formatFileSize(attachment.size) }}
              </button>
            </div>
          </div>

          <form class="mt-4 space-y-3" @submit.prevent="submitAssignment">
            <textarea
              v-model.trim="submissionContent"
              rows="8"
              maxlength="12000"
              placeholder="输入作业答案、实验过程或推导说明。"
              class="ui-input min-h-[180px] resize-y leading-6"
            ></textarea>

            <input
              :key="fileInputKey"
              type="file"
              multiple
              class="block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
              @change="handleStudentFileChange"
            />

            <div v-if="pendingFiles.length" class="flex flex-wrap gap-1.5">
              <span
                v-for="file in pendingFiles"
                :key="`${file.name}-${file.size}`"
                class="rounded-full bg-slate-100 px-2.5 py-1.5 text-[11px] font-medium text-slate-700"
              >
                {{ file.name }} · {{ formatFileSize(file.size) }}
              </span>
            </div>

            <div class="flex justify-end">
              <button type="submit" :disabled="isSubmitting" class="ui-button-primary disabled:opacity-60">
                {{ isSubmitting ? '正在提交...' : '提交作业' }}
              </button>
            </div>
          </form>
        </section>

        <section v-else class="ui-surface-compact">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-1.5">
              <h2 class="text-lg font-semibold text-slate-900">提交与批改</h2>
              <InfoTooltip text="在同一区域内筛选学生提交、查看文本与附件，并直接完成评分和反馈。" />
            </div>

            <div class="grid w-full gap-2 sm:w-auto sm:grid-cols-[220px,140px,96px]">
              <input
                v-model.trim="submissionSearch"
                type="text"
                placeholder="搜索学生或内容"
                class="ui-input"
              />
              <select v-model="submissionFilter" class="ui-input">
                <option v-for="option in submissionFilters" :key="option.value" :value="option.value">
                  {{ option.label }}（{{ option.count }}）
                </option>
              </select>
              <select v-model.number="submissionPageSize" class="ui-input">
                <option :value="20">20 / 页</option>
                <option :value="50">50 / 页</option>
                <option :value="100">100 / 页</option>
              </select>
            </div>
          </div>

          <div v-if="filteredSubmissions.length === 0" class="mt-4 rounded-xl bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            当前没有符合条件的学生提交。
          </div>

          <div v-else class="mt-4 grid gap-3 xl:grid-cols-[280px,minmax(0,1fr)]">
            <div>
              <div class="mb-2 flex items-center justify-between gap-2 text-xs text-slate-500">
                <span>共 {{ filteredSubmissions.length }} 份，当前显示 {{ submissionRangeLabel }}</span>
                <span>第 {{ submissionPage }} / {{ totalSubmissionPages }} 页</span>
              </div>

              <div class="max-h-[640px] space-y-2 overflow-y-auto pr-1">
                <article
                  v-for="submission in paginatedSubmissions"
                  :key="submission.id"
                  class="cursor-pointer rounded-xl border px-3 py-3 transition"
                  :class="selectedSubmissionId === submission.id ? 'border-sky-300 bg-sky-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'"
                  @click="selectedSubmissionId = submission.id"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0 flex-1">
                      <div class="flex flex-wrap items-center gap-1.5">
                        <h3 class="truncate text-sm font-semibold text-slate-900">
                          {{ submission.student_name || '未命名学生' }}
                        </h3>
                        <span
                          class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none"
                          :class="getToneBadgeClass(getSubmissionState(submission).tone)"
                        >
                          {{ getSubmissionState(submission).label }}
                        </span>
                      </div>
                      <p class="mt-1 text-[11px] text-slate-500">学号：{{ submission.student_id || '未填写' }}</p>
                    </div>
                    <p class="shrink-0 text-[11px] text-slate-500">{{ formatDateTime(submission.submitted_at, '暂无时间') }}</p>
                  </div>
                  <p class="mt-2 text-sm leading-6 text-slate-600">{{ getSubmissionPreview(submission.content) }}</p>
                </article>
              </div>

              <div v-if="totalSubmissionPages > 1" class="mt-3 flex items-center justify-between gap-2">
                <button
                  class="ui-button-secondary px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="submissionPage <= 1"
                  @click="submissionPage -= 1"
                >
                  上一页
                </button>
                <button
                  class="ui-button-secondary px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="submissionPage >= totalSubmissionPages"
                  @click="submissionPage += 1"
                >
                  下一页
                </button>
              </div>
            </div>

            <div v-if="selectedSubmission" class="space-y-3">
              <div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div class="flex flex-wrap items-center gap-1.5">
                      <h3 class="text-base font-semibold text-slate-900">
                        {{ selectedSubmission.student_name || '未命名学生' }}
                      </h3>
                      <span
                        class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none"
                        :class="getToneBadgeClass(getSubmissionState(selectedSubmission).tone)"
                      >
                        {{ getSubmissionState(selectedSubmission).label }}
                      </span>
                    </div>
                    <p class="mt-1 text-xs text-slate-500">
                      学号：{{ selectedSubmission.student_id || '未填写' }} · {{ formatDateTime(selectedSubmission.submitted_at, '暂无时间') }}
                    </p>
                  </div>
                </div>

                <div class="mt-3 rounded-xl bg-white px-4 py-3">
                  <p class="whitespace-pre-line text-sm leading-6 text-slate-700">
                    {{ selectedSubmission.content || '学生未填写文本内容。' }}
                  </p>
                </div>
              </div>

              <div v-if="selectedSubmission.attachments?.length" class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p class="text-sm font-medium text-slate-700">提交附件</p>
                <div class="mt-2 flex flex-wrap gap-1.5">
                  <button
                    v-for="attachment in selectedSubmission.attachments"
                    :key="attachment.id"
                    type="button"
                    class="rounded-full bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700"
                    @click="downloadSubmissionAttachment(selectedSubmission.id, attachment)"
                  >
                    {{ attachment.name }} · {{ formatFileSize(attachment.size) }}
                  </button>
                </div>
              </div>

              <form class="rounded-xl border border-slate-200 bg-white p-4" @submit.prevent="submitGrade">
                <div class="grid gap-3 sm:grid-cols-[120px,minmax(0,1fr)]">
                  <div>
                    <label class="block text-xs font-medium uppercase tracking-wide text-slate-500">分数</label>
                    <input
                      v-model.number="gradingForm.score"
                      type="number"
                      min="0"
                      :max="assignment.total_score || 100"
                      class="ui-input mt-1.5"
                    />
                  </div>

                  <div>
                    <label class="block text-xs font-medium uppercase tracking-wide text-slate-500">快捷评分</label>
                    <div class="mt-1.5 flex flex-wrap gap-1.5">
                      <button
                        v-for="action in quickScores"
                        :key="action.label"
                        type="button"
                        class="rounded-full bg-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700"
                        @click="gradingForm.score = action.value"
                      >
                        {{ action.label }}
                      </button>
                    </div>
                  </div>
                </div>

                <div class="mt-3">
                  <label class="block text-xs font-medium uppercase tracking-wide text-slate-500">反馈</label>
                  <textarea
                    v-model.trim="gradingForm.feedback"
                    rows="5"
                    maxlength="3000"
                    placeholder="填写给学生的反馈。"
                    class="ui-input mt-1.5 min-h-[132px] resize-y leading-6"
                  ></textarea>
                </div>

                <div class="mt-3 flex justify-end">
                  <button type="submit" :disabled="isGrading" class="ui-button-primary disabled:opacity-60">
                    {{ isGrading ? '正在保存...' : '保存评分' }}
                  </button>
                </div>
              </form>
            </div>

            <div v-else class="rounded-xl bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
              先从左侧选择一份学生提交。
            </div>
          </div>
        </section>
      </div>
    </main>
  </AppShell>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import InfoTooltip from '@/components/InfoTooltip.vue'
import { useAuthStore } from '@/stores/auth'
import api from '@/utils/api'
import {
  formatAssignmentWindow,
  formatDateTime,
  formatFileSize,
  formatRelativeDeadline,
  getDueMeta,
  getStudentAssignmentState,
  getTeacherAssignmentState,
  getToneBadgeClass,
  getToneTextClass
} from '@/utils/assignmentHelpers'
import { downloadProtectedFile } from '@/utils/fileDownload'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const assignment = ref(null)
const submissions = ref([])
const isLoading = ref(false)
const isSubmitting = ref(false)
const isGrading = ref(false)
const notice = ref({ type: '', text: '' })
const submissionContent = ref('')
const pendingFiles = ref([])
const fileInputKey = ref(0)
const submissionSearch = ref('')
const submissionFilter = ref('all')
const selectedSubmissionId = ref(null)
const submissionPage = ref(1)
const submissionPageSize = ref(20)
const gradingForm = ref({ score: null, feedback: '' })

const mySubmission = computed(() => assignment.value?.my_submission || null)
const assignmentState = computed(() => {
  if (!assignment.value) {
    return { label: '未加载', tone: 'slate' }
  }

  return authStore.isTeacher
    ? getTeacherAssignmentState(assignment.value)
    : getStudentAssignmentState(assignment.value)
})
const studentState = computed(() => (
  assignment.value ? getStudentAssignmentState(assignment.value) : { label: '未加载', tone: 'slate' }
))
const dueMeta = computed(() => getDueMeta(assignment.value || {}))
const relativeToneClass = computed(() => getToneTextClass(dueMeta.value.tone))
const selectedSubmission = computed(() => submissions.value.find((item) => item.id === selectedSubmissionId.value) || null)
const submissionFilters = computed(() => [
  { value: 'all', label: '全部', count: submissions.value.length },
  { value: 'ungraded', label: '待批改', count: submissions.value.filter(isUngradedSubmission).length },
  { value: 'graded', label: '已评分', count: submissions.value.filter((item) => !isUngradedSubmission(item)).length },
  { value: 'late', label: '逾期提交', count: submissions.value.filter((item) => item.is_late).length }
])
const filteredSubmissions = computed(() => submissions.value.filter((submission) => {
  if (submissionFilter.value === 'ungraded' && !isUngradedSubmission(submission)) return false
  if (submissionFilter.value === 'graded' && isUngradedSubmission(submission)) return false
  if (submissionFilter.value === 'late' && !submission.is_late) return false

  const keyword = submissionSearch.value.trim().toLowerCase()
  if (!keyword) return true

  return [submission.student_name, submission.student_id, submission.content]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(keyword)
}))
const totalSubmissionPages = computed(() => Math.max(1, Math.ceil(filteredSubmissions.value.length / submissionPageSize.value)))
const paginatedSubmissions = computed(() => {
  const startIndex = (submissionPage.value - 1) * submissionPageSize.value
  return filteredSubmissions.value.slice(startIndex, startIndex + submissionPageSize.value)
})
const submissionRangeLabel = computed(() => {
  if (!filteredSubmissions.value.length) {
    return '0-0'
  }

  const startIndex = (submissionPage.value - 1) * submissionPageSize.value + 1
  const endIndex = Math.min(submissionPage.value * submissionPageSize.value, filteredSubmissions.value.length)
  return `${startIndex}-${endIndex}`
})
const quickScores = computed(() => {
  const total = Number(assignment.value?.total_score || 100)

  return [
    { label: `满分 ${total}`, value: total },
    { label: `60% ${Math.round(total * 0.6)}`, value: Math.round(total * 0.6) }
  ]
})

function setNotice(type, text) {
  notice.value = { type, text }
}

function clearNotice() {
  notice.value = { type: '', text: '' }
}

function isUngradedSubmission(submission) {
  return submission?.score === null || submission?.score === undefined
}

function getSubmissionState(submission) {
  if (!submission) {
    return { label: '未知', tone: 'slate' }
  }

  if (!isUngradedSubmission(submission)) {
    return { label: `已评分 ${submission.score}`, tone: 'emerald' }
  }

  if (submission.is_late) {
    return { label: '逾期待批改', tone: 'amber' }
  }

  return { label: '待批改', tone: 'sky' }
}

function getSubmissionPreview(content) {
  const normalized = String(content || '').trim()
  if (!normalized) {
    return '学生未填写文本内容。'
  }

  return normalized.length > 72 ? `${normalized.slice(0, 72)}...` : normalized
}

function handleStudentFileChange(event) {
  pendingFiles.value = Array.from(event.target.files || [])
}

async function loadAssignmentDetail() {
  isLoading.value = true
  clearNotice()

  try {
    const requests = [api.get(`/assignments/${route.params.id}`)]
    if (authStore.isTeacher) {
      requests.push(api.get(`/assignments/${route.params.id}/submissions`))
    }

    const [detailResponse, submissionsResponse] = await Promise.all(requests)
    assignment.value = detailResponse.assignment || null
    submissionContent.value = assignment.value?.my_submission?.content || ''
    submissions.value = authStore.isTeacher ? (submissionsResponse?.submissions || []) : []

    if (authStore.isTeacher && !submissions.value.find((item) => item.id === selectedSubmissionId.value)) {
      selectedSubmissionId.value = submissions.value.find(isUngradedSubmission)?.id || submissions.value[0]?.id || null
    }
  } catch (error) {
    assignment.value = null
    submissions.value = []
    selectedSubmissionId.value = null
    setNotice('error', error?.error || '加载作业详情失败')
  } finally {
    isLoading.value = false
  }
}

async function downloadAssignmentAttachment(attachment) {
  try {
    await downloadProtectedFile(
      `/api/assignments/${assignment.value.id}/attachments/${attachment.id}/download`,
      authStore.token,
      attachment.name
    )
  } catch (error) {
    setNotice('error', error.message || '下载附件失败')
  }
}

async function downloadSubmissionAttachment(submissionId, attachment) {
  try {
    await downloadProtectedFile(
      `/api/assignments/submissions/${submissionId}/attachments/${attachment.id}/download`,
      authStore.token,
      attachment.name
    )
  } catch (error) {
    setNotice('error', error.message || '下载附件失败')
  }
}

async function submitAssignment() {
  if (!submissionContent.value.trim()) {
    setNotice('error', '提交内容不能为空')
    return
  }

  isSubmitting.value = true
  clearNotice()

  try {
    const formData = new FormData()
    formData.append('content', submissionContent.value.trim())
    pendingFiles.value.forEach((file) => formData.append('files', file))

    const response = await api.post(`/assignments/${route.params.id}/submit`, formData)
    pendingFiles.value = []
    fileInputKey.value += 1
    await loadAssignmentDetail()
    setNotice('success', response?.message || '作业提交成功')
  } catch (error) {
    setNotice('error', error?.error || '作业提交失败')
  } finally {
    isSubmitting.value = false
  }
}

async function submitGrade() {
  if (!selectedSubmission.value) {
    setNotice('error', '请先选择一份学生提交')
    return
  }

  if (gradingForm.value.score === null || gradingForm.value.score === undefined || gradingForm.value.score === '') {
    setNotice('error', '请先填写分数')
    return
  }

  isGrading.value = true
  clearNotice()

  try {
    await api.put(`/assignments/submissions/${selectedSubmission.value.id}/grade`, {
      score: gradingForm.value.score,
      feedback: gradingForm.value.feedback || ''
    })
    await loadAssignmentDetail()
    setNotice('success', '评分已保存')
  } catch (error) {
    setNotice('error', error?.error || '评分保存失败')
  } finally {
    isGrading.value = false
  }
}

async function toggleAssignmentClosed() {
  if (!assignment.value) return

  const wasClosed = assignment.value.is_closed
  const action = assignment.value.is_closed ? '重新开放' : '关闭'
  if (!window.confirm(`确认${action}当前作业？`)) {
    return
  }

  try {
    if (assignment.value.is_closed) {
      await api.post(`/assignments/${assignment.value.id}/reopen`)
    } else {
      await api.post(`/assignments/${assignment.value.id}/close`)
    }

    await loadAssignmentDetail()
    setNotice('success', wasClosed ? '作业已重新开放' : '作业已关闭')
  } catch (error) {
    setNotice('error', error?.error || `${action}作业失败`)
  }
}

async function removeAssignment() {
  if (!assignment.value) {
    return
  }

  if (!window.confirm(`确认删除作业“${assignment.value.title}”？已收集的提交和附件也会一并删除。`)) {
    return
  }

  try {
    await api.delete(`/assignments/${assignment.value.id}`)
    router.push('/assignments')
  } catch (error) {
    setNotice('error', error?.error || '删除作业失败')
  }
}

watch([submissionSearch, submissionFilter, submissionPageSize], () => {
  submissionPage.value = 1
})

watch(totalSubmissionPages, (pageCount) => {
  if (submissionPage.value > pageCount) {
    submissionPage.value = pageCount
  }
})

watch(paginatedSubmissions, (items) => {
  if (!authStore.isTeacher) {
    return
  }

  if (!items.find((item) => item.id === selectedSubmissionId.value)) {
    selectedSubmissionId.value = items[0]?.id || null
  }
})

watch(selectedSubmission, (submission) => {
  gradingForm.value = {
    score: submission?.score ?? null,
    feedback: submission?.feedback || ''
  }
})

onMounted(() => {
  loadAssignmentDetail()
})
</script>
