import { buildContentDisposition } from './security.js'

const DEFAULT_ALLOWED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif'
])

export const MAX_IMAGE_UPLOAD_BYTES = 3 * 1024 * 1024

export function isFileLike(value) {
  return value
    && typeof value.name === 'string'
    && typeof value.type === 'string'
    && typeof value.stream === 'function'
}

export function normalizeUploadedFileName(value = 'image') {
  const normalized = `${value || 'image'}`
    .split(/[\\/]/)
    .pop()
    .replace(/[\r\n]/g, ' ')
    .trim()
    .slice(0, 255)

  return normalized || 'image'
}

export function validateImageFile(
  file,
  {
    label = '图片',
    maxBytes = MAX_IMAGE_UPLOAD_BYTES,
    allowedTypes = DEFAULT_ALLOWED_IMAGE_TYPES
  } = {}
) {
  if (!isFileLike(file)) {
    return `请选择要上传的${label}`
  }

  const contentType = `${file.type || ''}`.toLowerCase()

  if (!allowedTypes.has(contentType)) {
    return `${label}仅支持 PNG、JPG、WEBP 或 GIF 格式`
  }

  if ((file.size || 0) <= 0) {
    return `${label}不能为空`
  }

  if ((file.size || 0) > maxBytes) {
    return `${label}大小不能超过 ${Math.round(maxBytes / 1024 / 1024)} MB`
  }

  return ''
}

export function createPublicFileResponse(
  object,
  {
    fileName = 'image',
    contentType = 'application/octet-stream',
    cacheControl = 'public, max-age=86400'
  } = {}
) {
  const headers = new Headers()

  if (typeof object.writeHttpMetadata === 'function') {
    object.writeHttpMetadata(headers)
  }

  headers.set(
    'Content-Type',
    object.httpMetadata?.contentType || headers.get('Content-Type') || contentType
  )
  headers.set('Cache-Control', cacheControl)
  headers.set('Content-Disposition', buildContentDisposition(fileName, 'inline'))

  if (object.httpEtag) {
    headers.set('ETag', object.httpEtag)
  }

  if (object.size !== undefined) {
    headers.set('Content-Length', String(object.size))
  }

  return new Response(object.body, { headers })
}
