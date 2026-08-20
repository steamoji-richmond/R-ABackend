import Registration from '../models/Registration.js'
import Session from '../models/Session.js'
import Member from '../models/Member.js'
import Branch from '../models/Branch.js'
import { config } from '../config.js'
import { createCheckout, verifyPayment } from '../services/square.js'
import {
  sendPaymentPendingEmail,
  sendPaymentReceiptEmail,
  sendAdminPaymentNotificationEmail,
} from '../services/email.js'

const TZ = () => config.workshopTimezone || 'America/Vancouver'
const ABANDONED_DELAY_MS = () => config.abandonedPaymentDelayMs || 45 * 60 * 1000

function vancouverDateKey(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date instanceof Date ? date : new Date(date))
}

function calendarDaysUntilSession(sessionDt, fromDate = new Date()) {
  const sessionKey = vancouverDateKey(sessionDt)
  const todayKey = vancouverDateKey(fromDate)
  const [y1, m1, d1] = todayKey.split('-').map(Number)
  const [y2, m2, d2] = sessionKey.split('-').map(Number)
  const a = Date.UTC(y1, m1 - 1, d1)
  const b = Date.UTC(y2, m2 - 1, d2)
  return Math.round((b - a) / 86_400_000)
}

async function getBranchForSession(session) {
  if (!session?.branchId) return null
  return Branch.findOne({ id: session.branchId }).lean()
}

function branchCanEmail(branch) {
  return !!(branch?.email?.trim() && branch?.gmailAppPass?.trim())
}

/** Notify branch admin inbox about a payment event. Failures are logged only. */
async function notifyAdmin(branch, member, session, registration, eventType, extra = {}) {
  if (!branchCanEmail(branch)) return false
  try {
    await sendAdminPaymentNotificationEmail(branch, member, session, registration, eventType, extra)
    console.log(`[payment:admin] ${eventType} notification sent to ${branch.email}`)
    return true
  } catch (err) {
    console.error(`[payment:admin] ${eventType} notification failed:`, err.message)
    return false
  }
}

async function loadRegistrationContext(reg) {
  const [session, member] = await Promise.all([
    Session.findOne({ id: reg.sessionId }).lean(),
    Member.findById(reg.memberId).lean(),
  ])
  if (!session) return null
  const branch = await getBranchForSession(session)
  return { session, member, branch }
}

/** Send payment receipt email once per paid registration. Returns true if sent. */
async function sendPaidRegistrationEmail(reg, session, branch, member) {
  if (reg.confirmationEmailSentAt) {
    console.log(`[payment:confirm] receipt email already sent for ${reg.id}`)
    return false
  }
  if (!member?.parentEmail) {
    console.warn(`[payment:confirm] no parentEmail for member ${member?._id} — email skipped`)
    return false
  }
  if (!branchCanEmail(branch)) {
    console.warn(
      `[payment:confirm] branch "${branch?.name || '?'}" missing email/gmailAppPass — email skipped`
    )
    return false
  }

  const regPayload = typeof reg.toObject === 'function' ? reg.toObject() : reg
  await sendPaymentReceiptEmail(member, session, branch, reg.id, regPayload)
  await Registration.updateOne({ id: reg.id }, { confirmationEmailSentAt: new Date() })
  console.log(`[payment:confirm] payment receipt email sent to ${member.parentEmail}`)

  await notifyAdmin(branch, member, session, regPayload, 'payment_received')
  return true
}

/**
 * Email parent with payment link. Does NOT run on initial checkout redirect.
 * @param {'return_visit'|'abandoned'|'reminder'} reason
 */
async function sendPaymentPendingNotice(reg, session, branch, member, checkoutUrl, reason) {
  if (!member?.parentEmail) {
    console.warn(`[payment:email] skipped — no parentEmail (${reason})`)
    return false
  }
  if (!branchCanEmail(branch)) {
    console.warn(`[payment:email] skipped — branch email not configured (${reason})`)
    return false
  }
  if (!checkoutUrl) {
    console.warn(`[payment:email] skipped — no checkout URL (${reason})`)
    return false
  }

  const regPayload = typeof reg.toObject === 'function' ? reg.toObject() : reg
  await sendPaymentPendingEmail(member, session, branch, regPayload, checkoutUrl)

  const update = {}
  if (reason === 'abandoned') update.paymentAbandonedEmailSentAt = new Date()
  if (reason === 'return_visit') update.paymentPendingEmailSentAt = new Date()
  if (reason === 'reminder') {
    // caller sets paymentReminder3DaySentAt / paymentReminder2DaySentAt
  }
  if (Object.keys(update).length) {
    await Registration.updateOne({ id: reg.id }, update)
  }

  console.log(`[payment:email] payment pending email sent to ${member.parentEmail} (${reason})`)

  if (reason === 'abandoned') {
    await notifyAdmin(branch, member, session, regPayload, 'payment_abandoned')
  } else if (reason === 'reminder') {
    // admin notify handled by caller with daysBefore
  }
  return true
}

/** Parent clicked "Pay now" again — send link once, no admin alert. */
async function trySendReturnVisitPaymentEmail(reg, session, branch, member, checkoutUrl) {
  if (reg.paymentPendingEmailSentAt) {
    console.log(`[payment:checkout] return-visit email already sent for ${reg.id}`)
    return false
  }
  return sendPaymentPendingNotice(reg, session, branch, member, checkoutUrl, 'return_visit')
}

/**
 * Create Square checkout. Does NOT email on first redirect — caller passes
 * sendPaymentEmail:true when the parent explicitly clicks "Pay now" again.
 */
export async function createPaymentLink(registrationId, { sendPaymentEmail = false } = {}) {
  if (!registrationId) return { success: false, error: 'registrationId required' }
  const reg = await Registration.findOne({ id: registrationId })
  if (!reg) return { success: false, error: 'Registration not found' }
  if (reg.paymentStatus === 'paid') {
    return { success: true, status: 'paid', checkoutUrl: '', paymentId: reg.paymentId }
  }
  if (reg.paymentStatus === 'not_required' || Number(reg.priceAmount) <= 0) {
    return {
      success: true,
      status: 'not_required',
      checkoutUrl: '',
      paymentId: '',
      priceAmount: 0,
    }
  }

  const ctx = await loadRegistrationContext(reg)
  if (!ctx) return { success: false, error: 'Session not found' }
  const { session, member, branch } = ctx

  const checkout = await createCheckout({
    registration: {
      id: reg.id,
      priceAmount: reg.priceAmount,
      currency: reg.currency,
      parentEmail: member?.parentEmail || '',
    },
    session,
    branch,
  })
  reg.paymentProvider = checkout.provider
  reg.paymentId = checkout.paymentId
  reg.paymentCheckoutUrl = checkout.checkoutUrl
  await reg.save()

  let pendingEmailSent = false
  if (sendPaymentEmail && checkout.checkoutUrl) {
    try {
      pendingEmailSent = await trySendReturnVisitPaymentEmail(
        reg,
        session,
        branch,
        member,
        checkout.checkoutUrl
      )
    } catch (err) {
      console.error('[payment:checkout] return-visit email failed:', err.message)
    }
  }

  return {
    success: true,
    status: checkout.status,
    checkoutUrl: checkout.checkoutUrl,
    paymentId: checkout.paymentId,
    priceAmount: reg.priceAmount,
    currency: reg.currency,
    pendingEmailSent,
  }
}

export async function confirmPayment(registrationId) {
  console.log(`[payment:confirm] called — registrationId="${registrationId}"`)

  if (!registrationId) return { success: false, error: 'registrationId required' }

  const reg = await Registration.findOne({ id: registrationId })
  if (!reg) return { success: false, error: 'Registration not found' }
  if (!reg.paymentId) {
    return { success: false, error: 'No payment linked to this registration' }
  }

  const session = await Session.findOne({ id: reg.sessionId }).lean()
  if (!session) return { success: false, error: 'Session not found' }

  const branch = await getBranchForSession(session)
  const result = await verifyPayment(reg.paymentId, branch)

  let emailSent = false

  if (result.paid) {
    reg.paymentStatus = 'paid'
    if (!reg.paidAt) reg.paidAt = new Date()
    await reg.save()

    await Session.updateOne(
      { id: reg.sessionId },
      { $addToSet: { reg: reg.id } }
    )

    const member = await Member.findById(reg.memberId).lean()
    try {
      emailSent = await sendPaidRegistrationEmail(reg, session, branch, member)
    } catch (err) {
      console.error(`[payment:confirm] receipt email failed:`, err.message)
    }
  }

  return {
    success: true,
    ...result,
    registrationId: reg.id,
    emailSent,
    confirmationEmailSentAt: reg.confirmationEmailSentAt || null,
  }
}

const REMINDER_DAYS = [3, 2]

/**
 * Cron: email parents who registered but abandoned checkout (~45 min, still unpaid).
 */
export async function sendAbandonedPaymentEmails() {
  const now = Date.now()
  const cutoff = new Date(now - ABANDONED_DELAY_MS())

  const pendingRegs = await Registration.find({
    paymentStatus: 'pending',
    priceAmount: { $gt: 0 },
    paymentAbandonedEmailSentAt: null,
    registeredDateAndTime: { $lte: cutoff },
  }).lean()

  if (!pendingRegs.length) {
    console.log('[cron] No abandoned payments to email.')
    return { sent: 0, skipped: 0 }
  }

  const sessionIds = [...new Set(pendingRegs.map((r) => r.sessionId).filter(Boolean))]
  const sessions = await Session.find({
    id: { $in: sessionIds },
    dt: { $gt: new Date() },
  }).lean()
  const sessionMap = new Map(sessions.map((s) => [s.id, s]))

  let sent = 0
  let skipped = 0

  for (const reg of pendingRegs) {
    const session = sessionMap.get(reg.sessionId)
    if (!session) {
      skipped++
      continue
    }

    const member = await Member.findById(reg.memberId).lean()
    const branch = await getBranchForSession(session)
    if (!member?.parentEmail || !branchCanEmail(branch)) {
      skipped++
      continue
    }

    let checkoutUrl = reg.paymentCheckoutUrl || ''
    if (!checkoutUrl) {
      try {
        const link = await createPaymentLink(reg.id)
        checkoutUrl = link.checkoutUrl || ''
      } catch (err) {
        console.error(`[cron] Failed to create checkout for ${reg.id}:`, err.message)
        skipped++
        continue
      }
    }

    if (!checkoutUrl) {
      skipped++
      continue
    }

    try {
      await sendPaymentPendingNotice(reg, session, branch, member, checkoutUrl, 'abandoned')
      sent++
    } catch (err) {
      console.error(`[cron] Abandoned payment email failed for ${reg.id}:`, err.message)
      skipped++
    }
  }

  console.log(`[cron] Abandoned payment emails done — sent: ${sent}, skipped: ${skipped}`)
  return { sent, skipped }
}

/**
 * Cron: remind parents 3 and 2 days before the workshop if still unpaid.
 */
export async function sendUnpaidPaymentReminders() {
  const now = new Date()

  const pendingRegs = await Registration.find({
    paymentStatus: 'pending',
    priceAmount: { $gt: 0 },
  }).lean()

  if (!pendingRegs.length) {
    console.log('[cron] No unpaid registrations — skipping payment reminders.')
    return { sent: 0, skipped: 0 }
  }

  const sessionIds = [...new Set(pendingRegs.map((r) => r.sessionId).filter(Boolean))]
  const sessions = await Session.find({
    id: { $in: sessionIds },
    dt: { $gt: now },
  }).lean()
  const sessionMap = new Map(sessions.map((s) => [s.id, s]))

  let sent = 0
  let skipped = 0

  for (const reg of pendingRegs) {
    const session = sessionMap.get(reg.sessionId)
    if (!session?.dt) {
      skipped++
      continue
    }

    const daysUntil = calendarDaysUntilSession(session.dt, now)
    if (!REMINDER_DAYS.includes(daysUntil)) {
      skipped++
      continue
    }

    const alreadySent =
      daysUntil === 3 ? reg.paymentReminder3DaySentAt : reg.paymentReminder2DaySentAt
    if (alreadySent) {
      skipped++
      continue
    }

    const member = await Member.findById(reg.memberId).lean()
    const branch = await getBranchForSession(session)
    if (!member?.parentEmail || !branchCanEmail(branch)) {
      skipped++
      continue
    }

    let checkoutUrl = reg.paymentCheckoutUrl || ''
    if (!checkoutUrl) {
      try {
        const link = await createPaymentLink(reg.id)
        checkoutUrl = link.checkoutUrl || ''
      } catch (err) {
        console.error(`[cron] Failed to create checkout for ${reg.id}:`, err.message)
        skipped++
        continue
      }
    }

    if (!checkoutUrl) {
      skipped++
      continue
    }

    try {
      await sendPaymentPendingNotice(reg, session, branch, member, checkoutUrl, 'reminder')
      await Registration.updateOne(
        { id: reg.id },
        daysUntil === 3
          ? { paymentReminder3DaySentAt: new Date() }
          : { paymentReminder2DaySentAt: new Date() }
      )
      await notifyAdmin(branch, member, session, reg, 'payment_reminder', { daysBefore: daysUntil })
      sent++
    } catch (err) {
      console.error(`[cron] Payment reminder failed for ${reg.id}:`, err.message)
      skipped++
    }
  }

  console.log(`[cron] Unpaid payment reminders done — sent: ${sent}, skipped: ${skipped}`)
  return { sent, skipped }
}
