<template>
  <AppShell :title="'作业管理'" content-class="">
    <template #header-actions>
      <button class="ui-button-secondary" @click="loadAssignments">刷新</button>
      <button v-if="authStore.isTeacher" class="ui-button-primary" @click="openCreateModal">发布作业</button>
    </template>

    <main class="ui-page-compact max-w-7xl">
      <section class="ui-metric-grid md:grid-cols-4">
        <article v-for="card in statCards" :key="card.label" class="ui-metric-card px-3 py-3.5">
          <div class="flex items-center gap-1.5">
            <p class="text-xs font-medium text-slate-500">{{ card.label }}</p>
            <InfoTooltip :text="card.tooltip" />
          </div>
          <p class="mt-2 text-2xl font-semibold text-slate-900">{{ card.value }}</p>
        </article>
      </section>

      <section v-if="message.text" class="rounded-xl border px-4 py-3 text-sm"
        :class="message.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'">
        {{ message.text }}
      </section>

      <section class="ui-surface-compact">
        <div class="grid gap-3 md:grid-cols-[minmax(0,1fr),200px,96px]">
          <input v-model.trim="searchQuery" type="text" placeholder="搜索标题、说明或发布者" class="ui-input" />
          <select v-model="sortBy" class="ui-input">
            <option v-for="option in sortOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
          <button class="ui-button-secondary w-full justify-center" @click="resetFilters">重置</button>
        </div>

        <div class="mt-3 flex flex-wrap gap-1.5">
          <button v-for="option in filterOptions" :key="option.value" class="ui-filter-chip px-3 py-1.5 text-xs"
            :class="activeFilter === option.value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'"
            @click="activeFilter = option.value">
            {{ option.label }}（{{ option.count }}）
          </button>
        </div>
      </section>

      <section v-if="isLoading" class="ui-empty-state py-12">
        <div class="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-sky-600"></div>
        <p class="mt-3 text-sm text-slate-500">正在同步作业数据...</p>
      </section>

      <section v-else-if="filteredAssignments.length === 0" class="ui-empty-state py-12">
        <h2 class="text-lg font-semibold text-slate-900">没有匹配的作业</h2>
        <p class="mt-2 text-sm text-slate-500">调整搜索词或筛选条件后再试。</p>
      </section>

      <section v-else class="grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
        <article v-for="assignment in filteredAssignments" :key="assignment.id" class="ui-surface-compact">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span
                  class="inline-flex items-center self-center rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none"
                  :class="getToneBadgeClass(getAssignmentState(assignment).tone)">
                  {{ getAssignmentState(assignment).label }}
                </span>
                <span
                  class="inline-flex items-center self-center whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium leading-none"
                  :class="getToneTextClass(getDueMeta(assignment).tone)">
                  {{ formatRelativeDeadline(assignment) }}
                </span>
              </div>

              <h2 class="mt-3 text-lg font-semibold text-slate-900">{{ assignment.title }}</h2>
              <p class="mt-2 text-sm leading-6 text-slate-600">
                {{ getDescriptionPreview(assignment.description) }}
              </p>
            </div>

            <div class="min-w-[150px] rounded-xl bg-slate-50 px-3 py-2.5 text-right">
              <p class="text-[11px] uppercase tracking-wide text-slate-500">作业期限</p>
              <p class="mt-1.5 text-sm font-medium text-slate-900">{{ formatAssignmentWindow(assignment) }}</p>
            </div>
          </div>

          <div class="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div class="rounded-xl bg-slate-50 px-3 py-2.5">
              <p class="text-[11px] uppercase tracking-wide text-slate-500">总分</p>
              <p class="mt-1.5 text-sm font-semibold text-slate-900">{{ assignment.total_score || 100 }} 分</p>
            </div>
            <div class="rounded-xl bg-slate-50 px-3 py-2.5">
              <p class="text-[11px] uppercase tracking-wide text-slate-500">提醒窗口</p>
              <p class="mt-1.5 text-sm font-semibold text-slate-900">{{ assignment.reminder_hours || 72 }} 小时</p>
            </div>
            <div class="rounded-xl bg-slate-50 px-3 py-2.5">
              <p class="text-[11px] uppercase tracking-wide text-slate-500">附件</p>
              <p class="mt-1.5 text-sm font-semibold text-slate-900">{{ assignment.attachment_count || 0 }} 个</p>
            </div>
            <div class="rounded-xl bg-slate-50 px-3 py-2.5">
              <p class="text-[11px] uppercase tracking-wide text-slate-500">发布者</p>
              <p class="mt-1.5 text-sm font-semibold text-slate-900">{{ assignment.creator_name || '课程教师' }}</p>
            </div>
          </div>

          <div v-if="assignment.attachments?.length" class="mt-3 flex flex-wrap gap-1.5">
            <button v-for="attachment in assignment.attachments.slice(0, 2)" :key="attachment.id" type="button"
              class="rounded-full bg-slate-100 px-2.5 py-1.5 text-[11px] font-medium text-slate-700"
              @click="downloadAttachment(assignment, attachment)">
              {{ attachment.name }} · {{ formatFileSize(attachment.size) }}
            </button>
            <span v-if="assignment.attachments.length > 2"
              class="rounded-full bg-slate-100 px-2.5 py-1.5 text-[11px] font-medium text-slate-500">
              +{{ assignment.attachments.length - 2 }} 个
            </span>
          </div>

          <div class="mt-4 flex flex-wrap items-center justify-between gap-2.5 border-t border-slate-100 pt-3">
            <p class="text-xs text-slate-500">
              {{
                authStore.isTeacher
                  ? (assignment.is_closed ? '当前作业已关闭。' : `待批改 ${assignment.pending_grade_count || 0} 份`)
                  : '进入详情页提交附件并查看反馈。'
              }}
            </p>

            <div class="flex flex-wrap gap-2">
              <button class="ui-button-secondary px-3 py-2 text-xs" @click="openAssignment(assignment.id)">详情</button>
              <template v-if="authStore.isTeacher">
                <button class="ui-button-secondary px-3 py-2 text-xs" @click="openEditModal(assignment)">编辑</button>
                <button class="rounded-xl px-3 py-2 text-xs font-semibold text-white"
                  :class="assignment.is_closed ? 'bg-emerald-600' : 'bg-rose-600'"
                  @click="toggleAssignmentClosed(assignment)">
                  {{ assignment.is_closed ? '重新开放' : '关闭' }}
                </button>
                <button v-if="authStore.isAdmin"
                  class="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
                  @click="removeAssignment(assignment)">
                  删除
                </button>
              </template>
            </div>
          </div>
        </article>
      </section>
    </main>

    <div v-if="showManageModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm">
      <div class="max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 class="mt-1.5 text-xl font-semibold text-slate-900">
              {{ manageMode === 'create' ? '发布新作业' : '编辑作业' }}
            </h2>
          </div>
          <button class="ui-button-secondary px-3 py-2 text-xs" @click="closeManageModal">关闭</button>
        </div>

        <form class="mt-5 space-y-4" @submit.prevent="handleSaveAssignment">
          <div>
            <label class="block text-sm font-medium text-slate-700">作业标题</label>
            <input v-model.trim="manageForm.title" type="text" required maxlength="120" class="ui-input mt-2" />
          </div>

          <div>
            <div class="flex items-center gap-1.5">
              <label class="block text-sm font-medium text-slate-700">作业说明</label>
              <InfoTooltip text="详细任务要求、评分标准和注意事项建议写在这里，列表页只保留摘要。" />
            </div>
            <textarea v-model.trim="manageForm.description" rows="5" maxlength="4000"
              class="ui-input mt-2 min-h-[120px] resize-y leading-6"></textarea>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <div class="flex items-center gap-1.5">
                <label class="block text-sm font-medium text-slate-700">开放时间</label>
                <InfoTooltip text="学生在开放时间之前只能看到作业，不能提交。" />
              </div>
              <input v-model="manageForm.available_from" type="datetime-local" class="ui-input mt-2" />
            </div>

            <div>
              <div class="flex items-center gap-1.5">
                <label class="block text-sm font-medium text-slate-700">截止时间</label>
                <InfoTooltip text="截止后会显示逾期状态；如果教师手动关闭，会直接停止提交。" />
              </div>
              <input v-model="manageForm.due_date" type="datetime-local" class="ui-input mt-2" />
            </div>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <div class="flex items-center gap-1.5">
                <label class="block text-sm font-medium text-slate-700">临近截止提醒</label>
                <InfoTooltip text="例如填写 24，则距离截止小于等于 24 小时时显示“临近截止”。" />
              </div>
              <input v-model.number="manageForm.reminder_hours" type="number" min="1" max="720" class="ui-input mt-2" />
            </div>

            <div>
              <label class="block text-sm font-medium text-slate-700">总分</label>
              <input v-model.number="manageForm.total_score" type="number" min="1" max="1000" class="ui-input mt-2" />
            </div>
          </div>

          <div>
            <div class="flex items-center gap-1.5">
              <label class="block text-sm font-medium text-slate-700">作业附件</label>
              <InfoTooltip text="支持多种文件格式，且可多次选择追加；编辑时也可以继续追加或删除已有附件。" />
            </div>
            <input :key="fileInputKey" type="file" multiple
              class="mt-2 block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
              @change="handleFileChange" />
            <p class="mt-2 text-xs text-slate-500">
              支持文档、压缩包、代码、图片、音视频等常见格式，可多次点击选择并追加；单个作业最多 {{ MAX_ASSIGNMENT_ATTACHMENT_COUNT }} 个附件。
            </p>
            <div v-if="selectedFiles.length" class="mt-2 flex flex-wrap gap-1.5">
              <span v-for="file in selectedFiles" :key="getFileIdentity(file)"
                class="inline-flex items-center gap-2 rounded-full bg-slate-100 px-2.5 py-1.5 text-[11px] font-medium text-slate-700">
                <span>{{ file.name }} · {{ formatFileSize(file.size) }}</span>
                <button type="button"
                  class="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-300"
                  @click="removeSelectedFile(file)">
                  移除
                </button>
              </span>
            </div>
            <div v-if="attachmentUploadProgress.active" class="mt-3 rounded-xl border border-sky-200 bg-sky-50/80 p-3">
              <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-sky-700">
                <p class="font-semibold">附件上传中（{{ attachmentUploadProgress.fileCount }} 个）</p>
                <p>{{ attachmentUploadProgress.percent }}%</p>
              </div>
              <div class="mt-2 h-2 overflow-hidden rounded-full bg-sky-100">
                <div class="h-full rounded-full bg-sky-600 transition-all duration-200"
                  :style="{ width: `${attachmentUploadProgress.percent}%` }" />
              </div>
              <p class="mt-2 text-xs text-slate-600">
                已上传 {{ formatFileSize(attachmentUploadProgress.loadedBytes) }} / {{
                  formatFileSize(attachmentUploadProgress.totalBytes) }}
              </p>
            </div>
          </div>

          <div v-if="existingAttachments.length" class="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div v-for="attachment in existingAttachments" :key="attachment.id"
              class="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2.5 ring-1 ring-slate-100">
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-slate-800">{{ attachment.name }}</p>
                <p class="mt-1 text-[11px] text-slate-500">{{ formatFileSize(attachment.size) }}</p>
              </div>
              <div class="flex gap-2">
                <button type="button" class="rounded-lg bg-slate-100 px-3 py-1.5 text-[11px] font-medium text-slate-700"
                  @click="downloadExistingAttachment(attachment)">
                  下载
                </button>
                <button type="button" class="rounded-lg bg-rose-50 px-3 py-1.5 text-[11px] font-medium text-rose-600"
                  @click="removeExistingAttachment(attachment)">
                  删除
                </button>
              </div>
            </div>
          </div>

          <div class="flex justify-end gap-2">
            <button type="button" class="ui-button-secondary" @click="closeManageModal">取消</button>
            <button type="submit" :disabled="isSaving" class="ui-button-primary disabled:opacity-60">
              {{ isSaving ? '正在保存...' : (manageMode === 'create' ? '确认发布' : '保存修改') }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </AppShell>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import InfoTooltip from '@/components/InfoTooltip.vue'
import { useAuthStore } from '@/stores/auth'
import api from '@/utils/api'
import {
  formatAssignmentWindow,
  formatFileSize,
  formatRelativeDeadline,
  getDueMeta,
  getStudentAssignmentState,
  getTeacherAssignmentState,
  getToneBadgeClass,
  getToneTextClass,
  normalizeDateTimeForApi,
  toDateTimeLocalValue
} from '@/utils/assignmentHelpers'
import { downloadProtectedFile } from '@/utils/fileDownload'

const router = useRouter()
const authStore = useAuthStore()

const assignments = ref([])
const isLoading = ref(false)
const searchQuery = ref('')
const activeFilter = ref('all')
const sortBy = ref('deadline')
const message = ref({ type: '', text: '' })

const showManageModal = ref(false)
const manageMode = ref('create')
const editingAssignmentId = ref(null)
const isSaving = ref(false)
const selectedFiles = ref([])
const existingAttachments = ref([])
const fileInputKey = ref(0)
const manageForm = ref(createDefaultForm())
const MAX_ASSIGNMENT_ATTACHMENT_COUNT = 10
const emptyAttachmentUploadProgress = () => ({
  active: false,
  fileCount: 0,
  loadedBytes: 0,
  totalBytes: 0,
  percent: 0
})
const attachmentUploadProgress = ref(emptyAttachmentUploadProgress())

function createDefaultForm() {
  const now = new Date()
  const due = new Date()
  due.setDate(due.getDate() + 7)
  due.setHours(23, 59, 0, 0)

  return {
    title: '',
    description: '',
    available_from: toDateTimeLocalValue(now),
    due_date: toDateTimeLocalValue(due),
    reminder_hours: 72,
    total_score: 100
  }
}

const sortOptions = computed(() => (
  authStore.isTeacher
    ? [
      { value: 'deadline', label: '按截止时间' },
      { value: 'start', label: '按开放时间' },
      { value: 'newest', label: '按发布时间' },
      { value: 'pending', label: '按待批改优先' }
    ]
    : [
      { value: 'deadline', label: '按截止时间' },
      { value: 'start', label: '按开放时间' },
      { value: 'newest', label: '按发布时间' },
      { value: 'todo', label: '按待办优先' }
    ]
))

const statCards = computed(() => (
  authStore.isTeacher
    ? [
      { label: '已发布作业', value: assignments.value.length, tooltip: '当前课程已发布的作业数量。' },
      { label: '待批改份数', value: assignments.value.reduce((sum, item) => sum + (item.pending_grade_count || 0), 0), tooltip: '已经提交但尚未完成评分的作业份数。' },
      { label: '临近截止', value: assignments.value.filter((item) => getDueMeta(item).isDueSoon).length, tooltip: '根据各作业自己的提醒窗口计算。' },
      { label: '已关闭作业', value: assignments.value.filter((item) => item.is_closed).length, tooltip: '教师手动关闭后学生不能继续提交。' }
    ]
    : [
      { label: '全部作业', value: assignments.value.length, tooltip: '课程已经发布的全部作业。' },
      { label: '待提交', value: assignments.value.filter((item) => !item.my_submission && !getDueMeta(item).isClosed && !getDueMeta(item).isOverdue && !getDueMeta(item).isScheduled).length, tooltip: '当前仍可提交且你尚未提交的作业。' },
      { label: '临近截止', value: assignments.value.filter((item) => getDueMeta(item).isDueSoon && !item.my_submission).length, tooltip: '你尚未提交且已进入提醒窗口的作业。' },
      { label: '已关闭', value: assignments.value.filter((item) => getDueMeta(item).isClosed).length, tooltip: '教师已关闭，不能继续提交。' }
    ]
))

const filterOptions = computed(() => (
  authStore.isTeacher
    ? [
      { value: 'all', label: '全部', count: assignments.value.length },
      { value: 'scheduled', label: '未开始', count: assignments.value.filter((item) => getDueMeta(item).isScheduled).length },
      { value: 'due-soon', label: '临近截止', count: assignments.value.filter((item) => getDueMeta(item).isDueSoon).length },
      { value: 'needs-grading', label: '待批改', count: assignments.value.filter((item) => (item.pending_grade_count || 0) > 0).length },
      { value: 'closed', label: '已关闭', count: assignments.value.filter((item) => item.is_closed).length }
    ]
    : [
      { value: 'all', label: '全部', count: assignments.value.length },
      { value: 'scheduled', label: '未开始', count: assignments.value.filter((item) => getDueMeta(item).isScheduled).length },
      { value: 'pending', label: '待提交', count: assignments.value.filter((item) => !item.my_submission && !getDueMeta(item).isClosed && !getDueMeta(item).isOverdue && !getDueMeta(item).isScheduled).length },
      { value: 'grading', label: '待评分', count: assignments.value.filter((item) => item.my_submission && (item.my_submission.score === null || item.my_submission.score === undefined) && item.my_submission.status !== 'graded').length },
      { value: 'graded', label: '已评分', count: assignments.value.filter((item) => item.my_submission && ((item.my_submission.score !== null && item.my_submission.score !== undefined) || item.my_submission.status === 'graded')).length },
      { value: 'closed', label: '已关闭', count: assignments.value.filter((item) => getDueMeta(item).isClosed).length }
    ]
))

const filteredAssignments = computed(() => (
  [...assignments.value]
    .filter((assignment) => {
      const keyword = searchQuery.value.trim().toLowerCase()
      if (!keyword) return true
      const searchable = [assignment.title, assignment.description, assignment.creator_name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return searchable.includes(keyword)
    })
    .filter((assignment) => matchesAssignmentFilter(assignment))
    .sort((left, right) => sortAssignments(left, right))
))

function setMessage(type, text) {
  message.value = { type, text }
}

function clearMessage() {
  message.value = { type: '', text: '' }
}

function getAssignmentState(assignment) {
  return authStore.isTeacher ? getTeacherAssignmentState(assignment) : getStudentAssignmentState(assignment)
}

function getDescriptionPreview(text) {
  const normalized = String(text || '').trim()
  if (!normalized) {
    return '暂无作业说明，进入详情页可查看完整要求和附件。'
  }

  return normalized.length > 88 ? `${normalized.slice(0, 88)}...` : normalized
}

function getDateValue(value, fallback) {
  const parsed = new Date(String(value || '').replace(' ', 'T')).getTime()
  return Number.isNaN(parsed) ? fallback : parsed
}

function getStudentTodoPriority(assignment) {
  return ({
    missing: 0,
    pending: 1,
    scheduled: 2,
    submitted: 3,
    graded: 4,
    closed: 5
  }[getStudentAssignmentState(assignment).key] ?? 99)
}

function sortAssignments(left, right) {
  if (sortBy.value === 'deadline') {
    return getDateValue(left.due_date, Number.MAX_SAFE_INTEGER) - getDateValue(right.due_date, Number.MAX_SAFE_INTEGER)
      || getDateValue(right.created_at, 0) - getDateValue(left.created_at, 0)
  }

  if (sortBy.value === 'start') {
    return getDateValue(left.available_from, Number.MAX_SAFE_INTEGER) - getDateValue(right.available_from, Number.MAX_SAFE_INTEGER)
      || getDateValue(left.due_date, Number.MAX_SAFE_INTEGER) - getDateValue(right.due_date, Number.MAX_SAFE_INTEGER)
  }

  if (sortBy.value === 'newest') {
    return getDateValue(right.created_at, 0) - getDateValue(left.created_at, 0)
  }

  if (sortBy.value === 'pending') {
    return (right.pending_grade_count || 0) - (left.pending_grade_count || 0)
  }

  if (sortBy.value === 'todo') {
    return getStudentTodoPriority(left) - getStudentTodoPriority(right)
  }

  return 0
}

function matchesAssignmentFilter(assignment) {
  const meta = getDueMeta(assignment)

  if (activeFilter.value === 'all') return true
  if (activeFilter.value === 'scheduled') return meta.isScheduled
  if (activeFilter.value === 'closed') return meta.isClosed
  if (activeFilter.value === 'due-soon') return meta.isDueSoon
  if (activeFilter.value === 'needs-grading') return (assignment.pending_grade_count || 0) > 0
  if (activeFilter.value === 'pending') return !assignment.my_submission && !meta.isClosed && !meta.isOverdue && !meta.isScheduled
  if (activeFilter.value === 'grading') return assignment.my_submission && (assignment.my_submission.score === null || assignment.my_submission.score === undefined) && assignment.my_submission.status !== 'graded'
  if (activeFilter.value === 'graded') return assignment.my_submission && ((assignment.my_submission.score !== null && assignment.my_submission.score !== undefined) || assignment.my_submission.status === 'graded')

  return true
}

function resetFilters() {
  searchQuery.value = ''
  activeFilter.value = 'all'
  sortBy.value = sortOptions.value[0]?.value || 'deadline'
}

function resetFileState() {
  selectedFiles.value = []
  fileInputKey.value += 1
  attachmentUploadProgress.value = emptyAttachmentUploadProgress()
}

function openCreateModal() {
  manageMode.value = 'create'
  editingAssignmentId.value = null
  manageForm.value = createDefaultForm()
  existingAttachments.value = []
  resetFileState()
  showManageModal.value = true
}

function openEditModal(assignment) {
  manageMode.value = 'edit'
  editingAssignmentId.value = assignment.id
  manageForm.value = {
    title: assignment.title || '',
    description: assignment.description || '',
    available_from: toDateTimeLocalValue(assignment.available_from),
    due_date: toDateTimeLocalValue(assignment.due_date),
    reminder_hours: assignment.reminder_hours || 72,
    total_score: assignment.total_score || 100
  }
  existingAttachments.value = [...(assignment.attachments || [])]
  resetFileState()
  showManageModal.value = true
}

function closeManageModal() {
  showManageModal.value = false
  editingAssignmentId.value = null
  manageForm.value = createDefaultForm()
  existingAttachments.value = []
  resetFileState()
}

function handleFileChange(event) {
  const incomingFiles = Array.from(event.target.files || [])
  if (!incomingFiles.length) {
    return
  }

  const mergedFiles = new Map(
    selectedFiles.value.map((file) => [getFileIdentity(file), file])
  )

  incomingFiles.forEach((file) => {
    mergedFiles.set(getFileIdentity(file), file)
  })

  selectedFiles.value = Array.from(mergedFiles.values())
  event.target.value = ''
}

function getFileIdentity(file) {
  return `${file.name}-${file.size}-${file.lastModified}`
}

function removeSelectedFile(targetFile) {
  const targetIdentity = getFileIdentity(targetFile)
  selectedFiles.value = selectedFiles.value.filter((file) => getFileIdentity(file) !== targetIdentity)
}

async function uploadAttachments(assignmentId) {
  if (!selectedFiles.value.length) return

  const formData = new FormData()
  selectedFiles.value.forEach((file) => formData.append('files', file))

  const totalBytes = Math.max(
    selectedFiles.value.reduce((sum, file) => sum + (file.size || 0), 0),
    1
  )

  attachmentUploadProgress.value = {
    active: true,
    fileCount: selectedFiles.value.length,
    loadedBytes: 0,
    totalBytes,
    percent: 0
  }

  await api.post(`/assignments/${assignmentId}/attachments`, formData, {
    timeout: 180000,
    onUploadProgress: (event) => {
      const reportedTotal = Number(event?.total)
      const total = Number.isFinite(reportedTotal) && reportedTotal > 0 ? reportedTotal : totalBytes
      const loaded = Math.max(0, Math.min(Number(event?.loaded) || 0, total))
      const percent = Math.min(100, Math.round((loaded / total) * 100))

      attachmentUploadProgress.value = {
        ...attachmentUploadProgress.value,
        loadedBytes: loaded,
        totalBytes: total,
        percent
      }
    }
  })

  attachmentUploadProgress.value = {
    ...attachmentUploadProgress.value,
    loadedBytes: attachmentUploadProgress.value.totalBytes,
    percent: 100
  }
}

async function handleSaveAssignment() {
  if (!manageForm.value.title.trim()) {
    setMessage('error', '请先填写作业标题')
    return
  }

  if (existingAttachments.value.length + selectedFiles.value.length > MAX_ASSIGNMENT_ATTACHMENT_COUNT) {
    setMessage('error', `单个作业最多上传 ${MAX_ASSIGNMENT_ATTACHMENT_COUNT} 个附件`)
    return
  }

  isSaving.value = true
  clearMessage()
  attachmentUploadProgress.value = emptyAttachmentUploadProgress()

  try {
    const payload = {
      title: manageForm.value.title.trim(),
      description: manageForm.value.description?.trim() || '',
      available_from: normalizeDateTimeForApi(manageForm.value.available_from),
      due_date: normalizeDateTimeForApi(manageForm.value.due_date),
      reminder_hours: manageForm.value.reminder_hours,
      total_score: manageForm.value.total_score
    }

    let assignmentId = editingAssignmentId.value
    if (manageMode.value === 'create') {
      const response = await api.post('/assignments', payload)
      assignmentId = response.assignment?.id
    } else {
      await api.patch(`/assignments/${assignmentId}`, payload)
    }

    if (assignmentId) {
      await uploadAttachments(assignmentId)
    }

    closeManageModal()
    await loadAssignments()
    setMessage('success', manageMode.value === 'create' ? '作业发布成功' : '作业已更新')
  } catch (error) {
    setMessage('error', error?.error || '作业保存失败')
  } finally {
    attachmentUploadProgress.value = {
      ...attachmentUploadProgress.value,
      active: false
    }
    isSaving.value = false
  }
}

async function removeExistingAttachment(attachment) {
  if (!editingAssignmentId.value || !window.confirm(`确认删除附件“${attachment.name}”？`)) {
    return
  }

  try {
    const response = await api.delete(`/assignments/${editingAssignmentId.value}/attachments/${attachment.id}`)
    existingAttachments.value = response.attachments || []
    await loadAssignments()
    setMessage('success', '附件已删除')
  } catch (error) {
    setMessage('error', error?.error || '删除附件失败')
  }
}

async function downloadAttachment(assignment, attachment) {
  try {
    await downloadProtectedFile(
      `/api/assignments/${assignment.id}/attachments/${attachment.id}/download`,
      authStore.token,
      attachment.name
    )
  } catch (error) {
    setMessage('error', error.message || '下载附件失败')
  }
}

async function downloadExistingAttachment(attachment) {
  if (!editingAssignmentId.value) return
  await downloadAttachment({ id: editingAssignmentId.value }, attachment)
}

async function toggleAssignmentClosed(assignment) {
  const action = assignment.is_closed ? '重新开放' : '关闭'
  if (!window.confirm(`确认${action}“${assignment.title}”？`)) {
    return
  }

  try {
    if (assignment.is_closed) {
      await api.post(`/assignments/${assignment.id}/reopen`)
    } else {
      await api.post(`/assignments/${assignment.id}/close`)
    }

    await loadAssignments()
    setMessage('success', assignment.is_closed ? '作业已重新开放' : '作业已关闭')
  } catch (error) {
    setMessage('error', error?.error || `${action}作业失败`)
  }
}

async function removeAssignment(assignment) {
  if (!window.confirm(`确认删除作业“${assignment.title}”？已收集的提交和附件也会一并删除。`)) {
    return
  }

  try {
    await api.delete(`/assignments/${assignment.id}`)
    await loadAssignments()
    setMessage('success', '作业已删除')
  } catch (error) {
    setMessage('error', error?.error || '删除作业失败')
  }
}

function openAssignment(id) {
  router.push(`/assignments/${id}`)
}

async function loadAssignments() {
  isLoading.value = true
  clearMessage()

  try {
    const response = await api.get('/assignments')
    assignments.value = response.assignments || []
  } catch (error) {
    assignments.value = []
    setMessage('error', error?.error || '加载作业列表失败')
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  sortBy.value = sortOptions.value[0]?.value || 'deadline'
  loadAssignments()
})
</script>
