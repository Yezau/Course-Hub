const UTC8_OFFSET_HOURS = 8
const UTC8_OFFSET_MS = UTC8_OFFSET_HOURS * 60 * 60 * 1000
const UTC8_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/
const TIMEZONE_SUFFIX_PATTERN = /(Z|[+-]\d{2}:?\d{2})$/i

export function parseUtc8Date(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  if (typeof value === 'number') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  const trimmed = String(value).trim()
  if (!trimmed) return null

  const normalized = trimmed.replace('T', ' ')
  if (!TIMEZONE_SUFFIX_PATTERN.test(trimmed)) {
    const match = normalized.match(UTC8_DATE_TIME_PATTERN)
    if (match) {
      const [, year, month, day, hour = '00', minute = '00', second = '00'] = match
      const parsed = new Date(
        Date.UTC(
          Number(year),
          Number(month) - 1,
          Number(day),
          Number(hour) - UTC8_OFFSET_HOURS,
          Number(minute),
          Number(second)
        )
      )

      return Number.isNaN(parsed.getTime()) ? null : parsed
    }
  }

  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function getUtc8Timestamp(value, fallback = Number.NaN) {
  const parsed = parseUtc8Date(value)
  return parsed ? parsed.getTime() : fallback
}

export function formatUtc8DateTime(value, fallback = '未设置') {
  const parsed = parseUtc8Date(value)
  if (!parsed) return fallback

  return parsed.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

export function formatUtc8Date(value, fallback = '未设置') {
  const parsed = parseUtc8Date(value)
  if (!parsed) return fallback

  return parsed.toLocaleDateString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
}

export function formatUtc8MonthDayTime(value, fallback = '') {
  const parsed = parseUtc8Date(value)
  if (!parsed) return fallback

  return parsed.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

export function formatUtc8SqlDateTime(value) {
  const parsed = parseUtc8Date(value)
  if (!parsed) return null

  const utc8Date = new Date(parsed.getTime() + UTC8_OFFSET_MS)
  const year = utc8Date.getUTCFullYear()
  const month = String(utc8Date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(utc8Date.getUTCDate()).padStart(2, '0')
  const hour = String(utc8Date.getUTCHours()).padStart(2, '0')
  const minute = String(utc8Date.getUTCMinutes()).padStart(2, '0')
  const second = String(utc8Date.getUTCSeconds()).padStart(2, '0')

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}
