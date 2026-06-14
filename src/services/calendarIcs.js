import {
  buildCalendarEvent,
  buildCalendarEventUid,
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
 * iCalendar invite or cancellation.
 * Google Calendar matches cancels by UID + ORGANIZER + ATTENDEE + start/end.
 * Events added via the "Add to Google Calendar" URL cannot be cancelled this way.
 */
export function buildCalendarIcs({
  session,
  member,
  branch,
  registrationId,
  method = 'REQUEST',
  attendeeEmail,
}) {
  const uid = buildCalendarEventUid(registrationId)
  const event = buildCalendarEvent(session, member, branch)
  if (!uid || !event) return null

  const organizerEmail = (event.organizerEmail || branch?.email || '').trim().toLowerCase()
  const attendee = (attendeeEmail || member?.parentEmail || '').trim().toLowerCase()
  if (!organizerEmail || !attendee) return null

  const isCancel = method === 'CANCEL'
  const branchName = branch?.name || 'Steamoji'
  const now = formatIcsUtc(new Date())

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Steamoji Workshop//Registration//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${isCancel ? 'CANCEL' : 'REQUEST'}`,
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${formatIcsUtc(event.start)}`,
    `DTEND:${formatIcsUtc(event.end)}`,
    `SUMMARY:${escapeIcs(isCancel ? `[CANCELLED] ${event.title}` : event.title)}`,
    `DESCRIPTION:${escapeIcs(event.description)}`,
    `LOCATION:${escapeIcs(event.location)}`,
    `STATUS:${isCancel ? 'CANCELLED' : 'CONFIRMED'}`,
    `SEQUENCE:${isCancel ? 1 : 0}`,
    `CREATED:${now}`,
    `LAST-MODIFIED:${now}`,
    `ORGANIZER;CN=${escapeIcs(branchName)}:mailto:${organizerEmail}`,
    isCancel
      ? `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=DECLINED;RSVP=FALSE:mailto:${attendee}`
      : `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${attendee}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  return lines.map(foldIcsLine).join('\r\n')
}
