const TOKEN_KEY = 'agrisentinel_token'
const USER_KEY = 'agrisentinel_user'
const API_BASE = '/api'

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null')
  } catch {
    return null
  }
}

export function storeSession(token, user) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

async function request(path, { method = 'GET', body, form, headers = {}, timeout = 90000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  const opts = {
    method,
    headers: { ...headers },
    signal: controller.signal,
  }
  if (body !== undefined && body !== null) {
    if (form) {
      opts.body = body
    } else {
      opts.headers['Content-Type'] = 'application/json'
      opts.body = JSON.stringify(body)
    }
  }
  const token = getToken()
  if (token) opts.headers.Authorization = `Bearer ${token}`

  let res
  try {
    res = await fetch(`${API_BASE}${path}`, opts)
  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError') {
      throw new ApiError('The request timed out. Please try again.', 0, null)
    }
    throw new ApiError('Cannot reach the AgriSentinel API. Is the backend running?', 0, null)
  }
  clearTimeout(timer)

  let payload = null
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    payload = await res.json().catch(() => null)
  } else {
    payload = await res.text().catch(() => '')
  }

  if (!res.ok) {
    const message =
      (payload && (payload.error || payload.detail)) ||
      (typeof payload === 'string' && payload) ||
      `Request failed (${res.status})`
    if (res.status === 401 && !path.startsWith('/auth/login')) {
      window.dispatchEvent(new CustomEvent('agrisentinel:unauthorized'))
    }
    throw new ApiError(message, res.status, payload)
  }
  return payload
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  del: (path) => request(path, { method: 'DELETE' }),
  upload: (path, formData) => request(path, { method: 'POST', body: formData, form: true, timeout: 120000 }),
  raw: request,
}

export async function downloadFile(path, fallbackName = 'download.csv') {
  const token = getToken()
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new ApiError('Export failed', res.status, null)
  const blob = await res.blob()
  const disposition = res.headers.get('content-disposition') || ''
  const match = disposition.match(/filename="?([^"]+)"?/)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = match?.[1] || fallbackName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
