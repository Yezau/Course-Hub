export function parseDate(value) {
  if (!value) return null

  const normalized = typeof value === 'string'
    ? value.replace(' ', 'T')
    : value

  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function formatDateTime(value, fallback = '未设置') {
  const parsed = parseDate(value)
  if (!parsed) return fallback

  return parsed.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function toDateTimeLocalValue(value) {
  const parsed = parseDate(value)
  if (!parsed) return ''

  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  const hour = String(parsed.getHours()).padStart(2, '0')
  const minute = String(parsed.getMinutes()).padStart(2, '0')

  return `${year}-${month}-${day}T${hour}:${minute}`
}

export function normalizeDateTimeForApi(value) {
  if (!value) return null

  const trimmed = String(value).trim()
  if (!trimmed) return null

  if (trimmed.length === 16) {
    return `${trimmed.replace('T', ' ')}:00`
  }

  return trimmed.replace('T', ' ')
}

export function formatFileSize(value) {
  const size = Number(value || 0)
  if (!Number.isFinite(size) || size <= 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB']
  let unitIndex = 0
  let current = size

  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024
    unitIndex += 1
  }

  const fractionDigits = current >= 10 || unitIndex === 0 ? 0 : 1
  return `${current.toFixed(fractionDigits)} ${units[unitIndex]}`
}

export function formatAssignmentWindow(assignment) {
  const availableFrom = formatDateTime(assignment?.available_from, '')
  const dueDate = formatDateTime(assignment?.due_date, '')

  if (availableFrom && dueDate) {
    return `${availableFrom} - ${dueDate}`
  }

  if (availableFrom) {
    return `${availableFrom} 起开放`
  }

  if (dueDate) {
    return `截止至 ${dueDate}`
  }

  return '未设置期限'
}

export function getAttachmentCount(target) {
  return Array.isArray(target?.attachments) ? target.attachments.length : 0
}

function normalizeAssignmentInput(input) {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return input
  }

  return {
    due_date: input
  }
}

export function getDueMeta(input, now = Date.now()) {
  const assignment = normalizeAssignmentInput(input)
  const availableFrom = parseDate(assignment.available_from)
  const dueDate = parseDate(assignment.due_date)
  const currentTime = new Date(now).getTime()
  const reminderHours = Number(assignment.reminder_hours || 72)
  const reminderMs = Math.max(1, reminderHours) * 60 * 60 * 1000

  if (assignment.is_closed) {
    return {
      key: 'closed',
      label: '已关闭',
      tone: 'slate',
      isClosed: true,
      isScheduled: false,
      isOverdue: false,
      isDueSoon: false,
      diffMs: null
    }
  }

  if (availableFrom && availableFrom.getTime() > currentTime) {
    return {
      key: 'scheduled',
      label: '未开始',
      tone: 'sky',
      isClosed: false,
      isScheduled: true,
      isOverdue: false,
      isDueSoon: false,
      diffMs: availableFrom.getTime() - currentTime
    }
  }

  if (!dueDate) {
    return {
      key: 'no-deadline',
      label: '未设置截止时间',
      tone: 'slate',
      isClosed: false,
      isScheduled: false,
      isOverdue: false,
      isDueSoon: false,
      diffMs: null
    }
  }

  const diffMs = dueDate.getTime() - currentTime
  if (diffMs < 0) {
    return {
      key: 'overdue',
      label: '已截止',
      tone: 'rose',
      isClosed: false,
      isScheduled: false,
      isOverdue: true,
      isDueSoon: false,
      diffMs
    }
  }

  if (diffMs <= reminderMs) {
    return {
      key: 'due-soon',
      label: '临近截止',
      tone: 'amber',
      isClosed: false,
      isScheduled: false,
      isOverdue: false,
      isDueSoon: true,
      diffMs
    }
  }

  return {
    key: 'ongoing',
    label: '进行中',
    tone: 'emerald',
    isClosed: false,
    isScheduled: false,
    isOverdue: false,
    isDueSoon: false,
    diffMs
  }
}

export function formatRelativeDeadline(input, now = Date.now()) {
  const assignment = normalizeAssignmentInput(input)
  const meta = getDueMeta(assignment, now)

  if (meta.isClosed) {
    return '教师已关闭作业'
  }

  if (meta.isScheduled) {
    return assignment.available_from
      ? `${formatDateTime(assignment.available_from)} 开始`
      : '尚未开始'
  }

  if (meta.diffMs === null) {
    return '未设置截止时间'
  }

  const diff = Math.abs(meta.diffMs)
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

  if (meta.isOverdue) {
    if (days > 0) return `已超时 ${days} 天`
    if (hours > 0) return `已超时 ${hours} 小时`
    return `已超时 ${Math.max(minutes, 1)} 分钟`
  }

  if (days > 0) return `剩余 ${days} 天 ${hours} 小时`
  if (hours > 0) return `剩余 ${hours} 小时 ${minutes} 分钟`
  return `剩余 ${Math.max(minutes, 1)} 分钟`
}

export function getToneBadgeClass(tone) {
  const toneMap = {
    slate: 'bg-slate-100 text-slate-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    rose: 'bg-rose-100 text-rose-700',
    sky: 'bg-sky-100 text-sky-700',
    blue: 'bg-blue-100 text-blue-700'
  }

  return toneMap[tone] || toneMap.slate
}

export function getToneTextClass(tone) {
  const toneMap = {
    slate: 'text-slate-600',
    emerald: 'text-emerald-600',
    amber: 'text-amber-600',
    rose: 'text-rose-600',
    sky: 'text-sky-600',
    blue: 'text-blue-600'
  }

  return toneMap[tone] || toneMap.slate
}

export function getStudentAssignmentState(assignment, now = Date.now()) {
  const dueMeta = getDueMeta(assignment, now)
  const submission = assignment?.my_submission

  if (submission) {
    if (submission.score !== null && submission.score !== undefined || submission.status === 'graded') {
      const score = submission.score ?? '-'
      return { key: 'graded', label: `已评分 ${score}`, tone: 'emerald' }
    }

    if (submission.is_late) {
      return { key: 'late-submitted', label: '逾期已交', tone: 'amber' }
    }

    return { key: 'submitted', label: '已提交待评分', tone: 'sky' }
  }

  if (dueMeta.isClosed) {
    return { key: 'closed', label: '已关闭', tone: 'slate' }
  }

  if (dueMeta.isScheduled) {
    return { key: 'scheduled', label: '未开始', tone: 'sky' }
  }

  if (dueMeta.isOverdue) {
    return { key: 'missing', label: '逾期未交', tone: 'rose' }
  }

  return { key: 'pending', label: '待提交', tone: dueMeta.isDueSoon ? 'amber' : 'slate' }
}

export function getTeacherAssignmentState(assignment, now = Date.now()) {
  const dueMeta = getDueMeta(assignment, now)

  if (dueMeta.isClosed) {
    return { key: 'closed', label: '已关闭', tone: 'slate' }
  }

  if (dueMeta.isScheduled) {
    return { key: 'scheduled', label: '未开始', tone: 'sky' }
  }

  if ((assignment?.pending_grade_count || 0) > 0) {
    return { key: 'needs-grading', label: '待批改', tone: 'amber' }
  }

  if ((assignment?.missing_count || 0) === 0 && (assignment?.submission_count || 0) > 0) {
    return { key: 'all-submitted', label: '已全部提交', tone: 'blue' }
  }

  if (dueMeta.isOverdue) {
    return { key: 'overdue', label: '已截止', tone: 'rose' }
  }

  if (dueMeta.isDueSoon) {
    return { key: 'due-soon', label: '临近截止', tone: 'amber' }
  }

  return { key: 'ongoing', label: '进行中', tone: 'emerald' }
}

export function calculateProgress(current, total) {
  if (!total) return 0
  return Math.max(0, Math.min(100, Math.round((current / total) * 100)))
}
