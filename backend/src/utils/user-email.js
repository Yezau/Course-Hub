import { normalizeEmail, normalizeRequiredString } from './validation.js'

const INTERNAL_EMAIL_DOMAIN = 'accounts.internal.invalid'

function buildEmailToken() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 20)
  }

  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

function buildEmailHint(value) {
  const normalized = normalizeRequiredString(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)

  return normalized || 'user'
}

export function isInternalUserEmail(email) {
  return typeof email === 'string' && email.endsWith(`@${INTERNAL_EMAIL_DOMAIN}`)
}

export function toPublicEmail(email) {
  if (!email || isInternalUserEmail(email)) {
    return null
  }

  return email
}

export function toStoredEmail(email, fallbackHint = 'user') {
  const normalized = normalizeEmail(email)
  if (normalized) {
    return normalized
  }

  return null
}
