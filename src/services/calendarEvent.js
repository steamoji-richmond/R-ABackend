import { config } from '../config.js'

const DEFAULT_DURATION_MS = 60 * 60 * 1000

/** YYYYMMDDTHHmmss in workshop timezone. */
export function formatGCalLocal(dt, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(dt)

  const get = (type) => parts.find((p) => p.type === type)?.value || '00'
  return `${get('year')}${get('month')}${get('day')}T${get('hour')}${get('minute')}${get('second')}`
}

export function formatIcsUtc(dt) {
  const d = dt instanceof Date ? dt : new Date(dt)
  const pad = (n) => String(n).padStart(2, '0')
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

function workshopDurationMs() {
  const durationMin = Number(config.workshopDurationMinutes)
  return Number.isFinite(durationMin) && durationMin > 0
    ? durationMin * 60 * 1000
    : DEFAULT_DURATION_MS
}

/** Stable UID so REQUEST + CANCEL .ics files match the same calendar event. */
export function buildCalendarEventUid(registrationId) {
  const id = String(registrationId || '').trim()
  if (!id) return ''
  const domain = config.calendarUidDomain || 'steamoji.online'
  return `workshop-reg-${id}@${domain}`
}

/** Shared workshop event fields for calendar links and .ics attachments. */
export function buildCalendarEvent(session, member, branch) {
  if (!session?.dt) return null

  const start = new Date(session.dt)
  if (isNaN(start.getTime())) return null

  const end = new Date(start.getTime() + workshopDurationMs())
  const tz = config.workshopTimezone || 'America/Vancouver'

  const childName = [member?.firstName, member?.lastName].filter(Boolean).join(' ').trim()
  const title = childName
    ? `${session.topic || 'Workshop'} — ${childName}`
    : session.topic || 'Steamoji Workshop'

  const location = [branch?.name, branch?.address, branch?.city, branch?.region]
    .filter(Boolean)
    .join(', ')

  const description = [
    childName ? `Registered for: ${childName}` : '',
    `Workshop: ${session.topic || 'Workshop'}`,
    branch?.phone ? `Contact: ${branch.phone}` : '',
    branch?.email ? `Email: ${branch.email}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return { start, end, tz, title, location, description, organizerEmail: branch?.email?.trim() || '' }
}
