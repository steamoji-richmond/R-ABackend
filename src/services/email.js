/**
 * Email service — Nodemailer + Gmail App Password, per-branch.
 *
 * Credentials come entirely from the branch document stored in MongoDB:
 *   branch.email       – the Gmail address to send from (same field shown in the UI)
 *   branch.gmailAppPass – 16-char App Password for that address
 *
 * How to create a Gmail App Password:
 *   1. Make sure 2-Step Verification is ON for the branch Gmail account.
 *   2. Go to: https://myaccount.google.com/apppasswords
 *   3. Click "Create app password", give it a label like "Workshop App".
 *   4. Copy the 16-character password into the branch's "Gmail App Password" field in Admin → Branches.
 *
 * If a branch has no app password configured, emails for that branch are
 * silently skipped (a warning is logged).
 *
 * All public functions are fire-and-forget: they log on failure but never
 * throw, so a missing/broken email config never disrupts the main API.
 */

import nodemailer from 'nodemailer'
import { config } from '../config.js'
import {
  registrationConfirmationTemplate,
  cancellationConfirmationTemplate,
  sessionReminderTemplate,
  sessionDeletedTemplate,
} from './emailTemplates.js'
import { buildCalendarIcs } from './calendarIcs.js'

function getTransporter(branch) {
  const user = branch?.email?.trim()
  const pass = branch?.gmailAppPass?.trim().replace(/\s+/g, '') // strip spaces Google adds for display

  console.log(`[email:debug] branch="${branch?.name}" user="${user}" pass_len=${pass?.length ?? 0}`)

  if (!user || !pass) return null
  return nodemailer.createTransport({ service: 'gmail', auth: { user, pass } })
}

function fromAddress(branch) {
  const user = branch?.email?.trim() || ''
  const name = branch?.name ? `${branch.name} Workshop` : 'Steamoji Workshop'
  return `"${name}" <${user}>`
}

// ─── Internal send helper ─────────────────────────────────────────────────

async function sendEmail({ to, subject, html, text, branch, icalEvent = null }) {
  const transporter = getTransporter(branch)

  if (!transporter) {
    throw new Error(
      `Branch "${branch?.name || '?'}" has no email/gmailAppPass configured`
    )
  }
  if (!to) {
    throw new Error('No recipient address')
  }

  try {
    const mail = {
      from: fromAddress(branch),
      to,
      subject,
      html,
      text,
    }
    if (icalEvent?.content) {
      mail.icalEvent = {
        method: icalEvent.method || 'REQUEST',
        filename: icalEvent.method === 'CANCEL' ? 'workshop-cancelled.ics' : 'workshop.ics',
        content: icalEvent.content,
      }
    }

    const info = await transporter.sendMail(mail)
    console.log(`[email] Sent "${subject}" to ${to} (messageId: ${info.messageId})`)
    return true
  } catch (err) {
    if (icalEvent?.content) {
      console.warn('[email] Calendar invite failed, retrying without it:', err.message)
      try {
        const info = await transporter.sendMail({
          from: fromAddress(branch),
          to,
          subject,
          html,
          text,
        })
        console.log(`[email] Sent "${subject}" to ${to} without calendar (messageId: ${info.messageId})`)
        return true
      } catch (retryErr) {
        console.error('[email] Failed to send email:', retryErr.message)
        throw retryErr
      }
    }
    console.error('[email] Failed to send email:', err.message)
    throw err
  }
}

// ─── Data helpers ─────────────────────────────────────────────────────────

const TZ = () => config.workshopTimezone || 'America/Vancouver'

function formatDate(dt) {
  const d = dt instanceof Date ? dt : new Date(dt)
  if (isNaN(d)) return String(dt ?? '')
  return d.toLocaleDateString('en-CA', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: TZ(),
  })
}

function formatTime(dt) {
  const d = dt instanceof Date ? dt : new Date(dt)
  if (isNaN(d)) return String(dt ?? '')
  return d.toLocaleTimeString('en-CA', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: TZ(),
  })
}

/** Prefer human-readable date/time saved on registration (admin local time). */
function formatStoredSessionTime(sessionTime) {
  const s = String(sessionTime || '').trim()
  if (!s) return ''
  // Already formatted e.g. "10:00 AM" from the registration UI
  if (/[ap]m/i.test(s) || s.includes(':')) return s
  return s
}

function buildTemplateData(member, session, branch, overrides = {}) {
  const storedTime = formatStoredSessionTime(overrides.sessionTime)
  return {
    parentName:    member.parent || member.firstName + ' ' + member.lastName,
    childName:     member.firstName + ' ' + member.lastName,
    sessionTopic:  session.topic  || 'Workshop',
    sessionDate:   session.dt ? formatDate(session.dt) : '',
    sessionTime:   storedTime || (session.dt ? formatTime(session.dt) : ''),
    branchName:    branch?.name   || 'our venue',
    branchAddress: branch?.address
      ? [branch.address, branch.city].filter(Boolean).join(', ')
      : '',
  }
}

function buildCalendarIcal({ registrationId, session, member, branch, method, attendeeEmail }) {
  const content = buildCalendarIcs({
    registrationId,
    session,
    member,
    branch,
    method,
    attendeeEmail,
  })
  if (!content) return null
  return { method, content }
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Email #1 — Registration confirmation.
 */
export async function sendRegistrationConfirmationEmail(member, session, branch, registrationId, registration) {
  const to = member?.parentEmail?.trim()
  if (!to) {
    console.warn('[email] Registration confirmation skipped — no parentEmail on member')
    return false
  }
  const data = {
    ...buildTemplateData(member, session, branch, {
      sessionDate: registration?.sessionDate,
      sessionTime: registration?.sessionTime,
    }),
    registrationId,
  }
  const { subject, html, text } = registrationConfirmationTemplate(data)
  const icalEvent = buildCalendarIcal({
    registrationId,
    session,
    member,
    branch,
    method: 'REQUEST',
    attendeeEmail: to,
  })
  await sendEmail({ to, subject, html, text, branch, icalEvent })
  return true
}

/**
 * Email #2 — Cancellation confirmation.
 */
export async function sendCancellationConfirmationEmail(member, session, branch, registrationId) {
  if (!member?.parentEmail) return
  const data = buildTemplateData(member, session, branch)
  const icalEvent = buildCalendarIcal({
    registrationId,
    session,
    member,
    branch,
    method: 'CANCEL',
    attendeeEmail: member.parentEmail,
  })
  const { subject, html, text } = cancellationConfirmationTemplate(data)
  await sendEmail({ to: member.parentEmail, subject, html, text, branch, icalEvent })
}

/**
 * Email #3 — Session reminder (day-before, 10 AM cron).
 */
export async function sendSessionReminderEmail(member, session, branch) {
  if (!member?.parentEmail) return
  const data = buildTemplateData(member, session, branch)
  const { subject, html, text } = sessionReminderTemplate(data)
  await sendEmail({ to: member.parentEmail, subject, html, text, branch })
}

/**
 * Email #4 — Session deleted notification.
 * Sent to each registered member when an admin deletes a session.
 */
export async function sendSessionDeletedEmail(member, session, branch, reason, registrationId) {
  if (!member?.parentEmail) return
  const data = { ...buildTemplateData(member, session, branch), reason: reason || '' }
  const icalEvent = buildCalendarIcal({
    registrationId,
    session,
    member,
    branch,
    method: 'CANCEL',
    attendeeEmail: member.parentEmail,
  })
  const { subject, html, text } = sessionDeletedTemplate(data)
  await sendEmail({ to: member.parentEmail, subject, html, text, branch, icalEvent })
}
