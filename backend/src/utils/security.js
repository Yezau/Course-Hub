import { isProductionEnv } from './env.js'

function toAsciiFileName(value) {
  const normalized = `${value || 'download'}`
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\]/g, '_')
    .trim()

  return normalized || 'download'
}

export function applySecurityHeaders(c) {
  const requestUrl = new URL(c.req.url)

  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  c.header('Cross-Origin-Opener-Policy', 'same-origin')
  c.header('Cross-Origin-Resource-Policy', 'same-site')

  if (requestUrl.protocol === 'https:') {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
  }
}

export function createErrorResponse(err, c) {
  const status = Number.isInteger(err?.status) ? err.status : 500
  const isProduction = isProductionEnv(c.env)
  const message = status >= 500 && isProduction
    ? '服务器处理请求失败，请稍后重试'
    : (err?.message || '服务器内部错误')

  return c.json({ error: message }, status)
}

export function getClientIp(c) {
  const forwardedFor = c.req.header('X-Forwarded-For')
  if (forwardedFor) {
    const [firstIp] = forwardedFor.split(',')
    if (firstIp?.trim()) {
      return firstIp.trim()
    }
  }

  return (
    c.req.header('CF-Connecting-IP') ||
    c.req.header('x-real-ip') ||
    'unknown'
  )
}

export function buildContentDisposition(fileName, disposition = 'attachment') {
  const safeFileName = `${fileName || 'download'}`
    .replace(/[\r\n"]/g, '')
    .trim() || 'download'
  const asciiFileName = toAsciiFileName(safeFileName)
  const encodedFileName = encodeURIComponent(safeFileName)

  return `${disposition}; filename="${asciiFileName}"; filename*=UTF-8''${encodedFileName}`
}
