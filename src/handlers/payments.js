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
    ? { id: reg.id, sessionId: reg.sessionId, paymentStatus: reg.paymentStatus, paymentId: reg.paymentId, priceAmount: reg.priceAmount, currency: reg.currency }
    : 'NOT FOUND'
  )
  if (!reg) return { success: false, error: 'Registration not found' }
  if (!reg.paymentId) {
    console.log(`[payment:confirm] no paymentId on registration — aborting`)
    return { success: false, error: 'No payment linked to this registration' }
  }

  const session = await Session.findOne({ id: reg.sessionId }).lean()
  console.log(`[payment:confirm] session:`, session
    ? { id: session.id, topic: session.topic, branchId: session.branchId }
    : 'NOT FOUND'
  )

  const branch = await getBranchForSession(session)
  console.log(`[payment:confirm] branch:`, branch
    ? { id: branch.id, name: branch.name, squareEnv: branch.squareEnv, hasToken: !!branch.squareAccessToken, hasLocation: !!branch.squareLocationId }
    : 'none (no branchId on session)'
  )

  console.log(`[payment:confirm] calling verifyPayment — orderId="${reg.paymentId}"`)
  const result = await verifyPayment(reg.paymentId, branch)
  console.log(`[payment:confirm] verifyPayment result:`, result)

  if (result.paid) {
    reg.paymentStatus = 'paid'
    reg.paidAt = new Date()
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
    if (member) {
      sendRegistrationConfirmationEmail(member, session, branch, reg.id).catch((err) => {
        console.error(`[payment:confirm] confirmation email failed:`, err.message)
      })
    }
  } else {
    console.log(`[payment:confirm] payment not yet completed — status="${result.status}"`)
  }

  return { success: true, ...result, registrationId: reg.id }
}
