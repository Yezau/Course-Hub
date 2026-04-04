function parseFileName(contentDisposition, fallbackName) {
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1])
  }

  const plainMatch = contentDisposition.match(/filename="([^"]+)"/i)
  if (plainMatch?.[1]) {
    return plainMatch[1]
  }

  return fallbackName
}

async function fetchProtectedFile(url, token, fallbackName = 'download') {
  const response = await fetch(url, {
    headers: token
      ? { Authorization: `Bearer ${token}` }
      : {}
  })

  if (!response.ok) {
    let message = '文件处理失败'

    try {
      const data = await response.json()
      if (data?.error) {
        message = data.error
      }
    } catch (error) {
      // Ignore JSON parse failures and keep the fallback message.
    }

    throw new Error(message)
  }

  const blob = await response.blob()
  const fileName = parseFileName(
    response.headers.get('content-disposition') || '',
    fallbackName
  )

  return {
    blob,
    fileName,
    contentType: response.headers.get('content-type') || 'application/octet-stream'
  }
}

function triggerDownload(objectUrl, fileName) {
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

export async function downloadProtectedFile(url, token, fallbackName = 'download') {
  const { blob, fileName } = await fetchProtectedFile(url, token, fallbackName)
  const objectUrl = URL.createObjectURL(blob)

  triggerDownload(objectUrl, fileName)
  URL.revokeObjectURL(objectUrl)

  return fileName
}

export async function openProtectedFile(url, token, fallbackName = 'preview') {
  const { blob, fileName, contentType } = await fetchProtectedFile(url, token, fallbackName)
  const objectUrl = URL.createObjectURL(blob)

  return {
    objectUrl,
    fileName,
    contentType
  }
}

export function revokeObjectUrl(objectUrl) {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl)
  }
}
