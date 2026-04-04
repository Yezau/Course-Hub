export const MIN_PASSWORD_LENGTH = 8

export function createHttpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

export function normalizeRequiredString(value) {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim()
}

export function normalizeOptionalString(value) {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized || null
}

export function normalizeEmail(value) {
  return normalizeRequiredString(value).toLowerCase()
}

export function validateUsername(username) {
  if (!username) {
    return '用户名不能为空'
  }

  if (username.length < 3 || username.length > 32) {
    return '用户名长度需要在 3 到 32 个字符之间'
  }

  if (/\s/.test(username)) {
    return '用户名不能包含空格'
  }

  if (/[<>]/.test(username)) {
    return '用户名包含非法字符'
  }

  return ''
}

export function validateEmail(email) {
  if (!email) {
    return ''
  }

  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  if (!isValid || email.length > 120) {
    return '邮箱格式无效'
  }

  return ''
}

export function validateStudentId(studentId) {
  if (!studentId) {
    return ''
  }

  if (studentId.length < 4 || studentId.length > 32) {
    return '学号长度需要在 4 到 32 个字符之间'
  }

  if (!/^[A-Za-z0-9_-]+$/.test(studentId)) {
    return '学号只能包含字母、数字、下划线和短横线'
  }

  return ''
}

export function validateRealName(realName) {
  if (!realName) {
    return ''
  }

  if (realName.length > 60) {
    return '真实姓名不能超过 60 个字符'
  }

  return ''
}

export function validateHttpOrRelativeUrl(value, fieldLabel = '地址') {
  if (!value) {
    return ''
  }

  const normalized = `${value}`.trim()

  if (normalized.startsWith('/') && !normalized.startsWith('//')) {
    return ''
  }

  try {
    const parsed = new URL(normalized)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return `${fieldLabel}必须使用 http、https 或站内相对路径`
    }
  } catch (error) {
    return `${fieldLabel}格式无效`
  }

  return ''
}

export function validateAvatarUrl(avatarUrl) {
  return validateHttpOrRelativeUrl(avatarUrl, '头像地址')
}

export function validatePassword(password) {
  if (!password) {
    return '密码不能为空'
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return `密码至少需要 ${MIN_PASSWORD_LENGTH} 位`
  }

  const categoryCount = [
    /[A-Za-z]/,
    /\d/,
    /[^A-Za-z0-9]/
  ].filter((pattern) => pattern.test(password)).length

  if (categoryCount < 2) {
    return '密码至少需要包含字母、数字、符号中的两类'
  }

  return ''
}
