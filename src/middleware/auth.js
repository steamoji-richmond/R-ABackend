import { config } from '../config.js'

export function getAuthKeys(req, body = {}) {
  const adminKey = String(
    req.headers['x-admin-key'] ||
      body.adminKey ||
      req.query.adminKey ||
      ''
  ).trim()
  const attendKey = String(
    req.headers['x-attend-key'] ||
      body.attendKey ||
      req.query.attendKey ||
      ''
  ).trim()
  return { adminKey, attendKey }
}

export function isAdminRequest(req, body = {}) {
  const { adminKey } = getAuthKeys(req, body)
  return !!(config.adminPass && adminKey && adminKey === config.adminPass)
}

export function isAttendRequest(req, body = {}) {
  if (isAdminRequest(req, body)) return true
  const { attendKey } = getAuthKeys(req, body)
  return !!(config.attendPass && attendKey && attendKey === config.attendPass)
}

export function requireAdmin(req, body = {}) {
  if (isAdminRequest(req, body)) return null
  return { success: false, error: 'Admin authentication required' }
}

export function requireAttend(req, body = {}) {
  if (isAttendRequest(req, body)) return null
  return { success: false, error: 'Attendance authentication required' }
}
