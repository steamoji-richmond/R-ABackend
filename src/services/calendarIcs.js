import {
  buildCalendarEvent,
  buildCalendarEventUid,
  formatGCalLocal,
  formatIcsUtc,
} from './calendarEvent.js'

function escapeIcs(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

function foldIcsLine(line) {
  const bytes = Buffer.from(line, 'utf8')
  if (bytes.length <= 75) return line

  const parts = []
  let chunk = ''
  for (const char of line) {
    const next = chunk + char
    if (Buffer.byteLength(next, 'utf8') > 75) {
      parts.push(chunk)
      chunk = ' ' + char
    } else {
      chunk = next
    }
  }
  if (chunk) parts.push(chunk)
  return parts.join('\r\n')
}

/**
 * iCalendar invite or cancellation (.ics).
 * CANCEL with the same UID removes the event in Google/Apple/Outlook
 * when the parent originally added it from the registration invite.
 */
export function buildCalendarIcs({ session, member, branch, registrationId, method = 'REQUEST' }) {
  const uid = buildCalendarEventUid(registrationId)
  const event = buildCalendarEvent(session, member, branch)
  if (!uid || !event) return null

  const isCancel = method === 'CANCEL'
  const branchName = branch?.name || 'Steamoji'

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Steamoji Workshop//Registration//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${isCancel ? 'CANCEL' : 'REQUEST'}`,
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatIcsUtc(new Date())}`,
    `DTSTART;TZID=${event.tz}:${formatGCalLocal(event.start, event.tz)}`,
    `DTEND;TZID=${event.tz}:${formatGCalLocal(event.end, event.tz)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    `DESCRIPTION:${escapeIcs(event.description)}`,
    `LOCATION:${escapeIcs(event.location)}`,
    `STATUS:${isCancel ? 'CANCELLED' : 'CONFIRMED'}`,
    `SEQUENCE:${isCancel ? 1 : 0}`,
  ]

  if (event.organizerEmail) {
    lines.push(`ORGANIZER;CN=${escapeIcs(branchName)}:mailto:${event.organizerEmail}`)
  }

  lines.push('END:VEVENT', 'END:VCALENDAR')

  return lines.map(foldIcsLine).join('\r\n')
}
