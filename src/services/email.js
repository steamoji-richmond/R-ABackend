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
import {
  registrationConfirmationTemplate,
  cancellationConfirmationTemplate,
  sessionReminderTemplate,
  sessionDeletedTemplate,
} from './emailTemplates.js'

function getTransporter(branch) {
  const user = branch?.email?.trim()
  const pass = branch?.gmailAppPass?.trim().replace(/\s+/g, '') // strip spaces Google adds for display

  console.log(`[email:debug] branch="${branch?.name}" user="${user}" pass="${pass}" pass_len=${pass?.length ?? 0}`)

  if (!user || !pass) return null
  return nodemailer.createTransport({ service: 'gmail', auth: { user, pass } })
}

function fromAddress(branch) {
  const user = branch?.email?.trim() || ''
  const name = branch?.name ? `${branch.name} Workshop` : 'Steamoji Workshop'
  return `"${name}" <${user}>`
}

// ─── Internal send helper ─────────────────────────────────────────────────

async function sendEmail({ to, subject, html, text, branch }) {
  const transporter = getTransporter(branch)

  if (!transporter) {
    console.warn(
      `[email] Branch "${branch?.name || '?'}" has no email/gmailAppPass configured — skipped: ${subject}`
    )
    return
  }
  if (!to) {
    console.warn('[email] No recipient address — email skipped:', subject)
    return
  }

  try {
    const info = await transporter.sendMail({
      from: fromAddress(branch),
      to,
      subject,
      html,
      text,
    })
    console.log(`[email] Sent "${subject}" to ${to} (messageId: ${info.messageId})`)
  } catch (err) {
    console.error('[email] Failed to send email:', err.message)
  }
}

// ─── Data helpers ─────────────────────────────────────────────────────────

function formatDate(dt) {
  const d = dt instanceof Date ? dt : new Date(dt)
  if (isNaN(d)) return String(dt ?? '')
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatTime(dt) {
  const d = dt instanceof Date ? dt : new Date(dt)
  if (isNaN(d)) return String(dt ?? '')
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function buildTemplateData(member, session, branch) {
  return {
    parentName:    member.parent || member.firstName + ' ' + member.lastName,
    childName:     member.firstName + ' ' + member.lastName,
    sessionTopic:  session.topic  || 'Workshop',
    sessionDate:   session.dt ? formatDate(session.dt) : '',
    sessionTime:   session.dt ? formatTime(session.dt) : '',
    branchName:    branch?.name   || 'our venue',
    branchAddress: branch?.address
      ? [branch.address, branch.city].filter(Boolean).join(', ')
      : '',
  }
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Email #1 — Registration confirmation.
 */
export async function sendRegistrationConfirmationEmail(member, session, branch, registrationId) {
  if (!member?.parentEmail) return
  const data = { ...buildTemplateData(member, session, branch), registrationId }
  const { subject, html, text } = registrationConfirmationTemplate(data)
  await sendEmail({ to: member.parentEmail, subject, html, text, branch })
}

/**
 * Email #2 — Cancellation confirmation.
 */
export async function sendCancellationConfirmationEmail(member, session, branch) {
  if (!member?.parentEmail) return
  const data = buildTemplateData(member, session, branch)
  const { subject, html, text } = cancellationConfirmationTemplate(data)
  await sendEmail({ to: member.parentEmail, subject, html, text, branch })
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
export async function sendSessionDeletedEmail(member, session, branch, reason) {
  if (!member?.parentEmail) return
  const data = { ...buildTemplateData(member, session, branch), reason: reason || '' }
  const { subject, html, text } = sessionDeletedTemplate(data)
  await sendEmail({ to: member.parentEmail, subject, html, text, branch })
}
