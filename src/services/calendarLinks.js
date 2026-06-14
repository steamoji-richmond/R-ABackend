import { buildCalendarEvent, formatGCalLocal } from './calendarEvent.js'

/**
 * Google Calendar "Add event" URL for a workshop session.
 * Note: events added via this link cannot be removed automatically —
 * use the .ics invite attachment for cancellable calendar events.
 */
export function buildGoogleCalendarUrl(session, member, branch) {
  const event = buildCalendarEvent(session, member, branch)
  if (!event) return ''

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${formatGCalLocal(event.start, event.tz)}/${formatGCalLocal(event.end, event.tz)}`,
    details: event.description,
    location: event.location,
    ctz: event.tz,
  })

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
