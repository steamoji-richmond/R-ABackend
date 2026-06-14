import Registration from '../models/Registration.js'
import Session from '../models/Session.js'
import Member from '../models/Member.js'
import Branch from '../models/Branch.js'
import { createCheckout, verifyPayment } from '../services/square.js'
import { sendRegistrationConfirmationEmail } from '../services/email.js'

async function getBranchForSession(session) {
  if (!session?.branchId) return null
  return Branch.findOne({ id: session.branchId }).lean()
}

/** Send confirmation email once per paid registration. Returns true if sent. */
async function sendPaidRegistrationEmail(reg, session, branch, member) {
  if (reg.confirmationEmailSentAt) {
    console.log(`[payment:confirm] confirmation email already sent for ${reg.id}`)
    return false
  }
  if (!member?.parentEmail) {
    console.warn(`[payment:confirm] no parentEmail for member ${member?._id} — email skipped`)
    return false
  }
  if (!branch?.email?.trim() || !branch?.gmailAppPass?.trim()) {
    console.warn(
      `[payment:confirm] branch "${branch?.name || '?'}" missing email/gmailAppPass — email skipped`
    )
    return false
  }

  const regPayload = typeof reg.toObject === 'function' ? reg.toObject() : reg
  await sendRegistrationConfirmationEmail(member, session, branch, reg.id, regPayload)
  await Registration.updateOne({ id: reg.id }, { confirmationEmailSentAt: new Date() })
  console.log(`[payment:confirm] confirmation email sent to ${member.parentEmail}`)
  return true
}

export async function createPaymentLink(registrationId) {
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
  const [session, member] = await Promise.all([
    Session.findOne({ id: reg.sessionId }).lean(),
    Member.findById(reg.memberId).lean(),
  ])
  if (!session) return { success: false, error: 'Session not found' }

  const branch = await getBranchForSession(session)

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
  return {
    success: true,
    status: checkout.status,
    checkoutUrl: checkout.checkoutUrl,
    paymentId: checkout.paymentId,
    priceAmount: reg.priceAmount,
    currency: reg.currency,
  }
}

export async function confirmPayment(registrationId) {
  console.log(`[payment:confirm] called — registrationId="${registrationId}"`)

  if (!registrationId) return { success: false, error: 'registrationId required' }

  const reg = await Registration.findOne({ id: registrationId })
  console.log(`[payment:confirm] registration lookup:`, reg
    ? {
        id: reg.id,
        sessionId: reg.sessionId,
        paymentStatus: reg.paymentStatus,
        paymentId: reg.paymentId,
        confirmationEmailSentAt: reg.confirmationEmailSentAt,
      }
    : 'NOT FOUND'
  )
  if (!reg) return { success: false, error: 'Registration not found' }
  if (!reg.paymentId) {
    console.log(`[payment:confirm] no paymentId on registration — aborting`)
    return { success: false, error: 'No payment linked to this registration' }
  }

  const session = await Session.findOne({ id: reg.sessionId }).lean()
  if (!session) return { success: false, error: 'Session not found' }

  const branch = await getBranchForSession(session)
  console.log(`[payment:confirm] branch:`, branch
    ? { id: branch.id, name: branch.name, hasEmail: !!branch.email, hasGmailPass: !!branch.gmailAppPass }
    : 'none (no branchId on session)'
  )

  console.log(`[payment:confirm] calling verifyPayment — orderId="${reg.paymentId}"`)
  const result = await verifyPayment(reg.paymentId, branch)
  console.log(`[payment:confirm] verifyPayment result:`, result)

  let emailSent = false

  if (result.paid) {
    reg.paymentStatus = 'paid'
    if (!reg.paidAt) reg.paidAt = new Date()
    await reg.save()
    console.log(`[payment:confirm] marked as paid, updating session.reg[]`)

    await Session.updateOne(
      { id: reg.sessionId },
      { $addToSet: { reg: reg.id } }
    )

    const member = await Member.findById(reg.memberId).lean()
    console.log(`[payment:confirm] member:`, member
      ? { name: `${member.firstName} ${member.lastName}`, parentEmail: member.parentEmail }
      : 'NOT FOUND'
    )

    try {
      emailSent = await sendPaidRegistrationEmail(reg, session, branch, member)
    } catch (err) {
      console.error(`[payment:confirm] confirmation email failed:`, err.message)
    }
  } else {
    console.log(`[payment:confirm] payment not yet completed — status="${result.status}"`)
  }

  return {
    success: true,
    ...result,
    registrationId: reg.id,
    emailSent,
    confirmationEmailSentAt: reg.confirmationEmailSentAt || null,
  }
}
