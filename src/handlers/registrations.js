import { nanoid } from 'nanoid'
import mongoose from 'mongoose'
import Registration from '../models/Registration.js'
import Session from '../models/Session.js'
import Member from '../models/Member.js'
import PendingMember from '../models/PendingMember.js'
import Branch from '../models/Branch.js'
import { serializeMemberAttend } from './members.js'
import { computePrice } from '../services/pricing.js'
import { expandVisibleBranchIds } from './branches.js'
import {
  sendRegistrationConfirmationEmail,
  sendCancellationConfirmationEmail,
} from '../services/email.js'

/**
 * Read registrations with member profile joined in.
 * Public callers must pass `email` (own registrations only).
 * Attendance staff pass attend auth + optional `sessionId`.
 * Admin sees everything.
 */
export async function getAllRegistrations({
  email,
  sessionId,
  admin = false,
  attend = false,
} = {}) {
  const e = email ? String(email).toLowerCase().trim() : ''
  const sid = sessionId ? String(sessionId).trim() : ''

  if (!admin && !attend && !e) {
    return { success: false, error: 'email is required' }
  }

  const match = {}
  if (sid) match.sessionId = sid

  const pipeline = [
    ...(Object.keys(match).length ? [{ $match: match }] : []),
    { $sort: { registeredDateAndTime: -1 } },
    {
      $lookup: {
        from: 'members',
        localField: 'memberId',
        foreignField: '_id',
        as: 'member',
      },
    },
    { $unwind: { path: '$member', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'sessions',
        localField: 'sessionId',
        foreignField: 'id',
        as: 'session',
      },
    },
    { $unwind: { path: '$session', preserveNullAndEmptyArrays: true } },
  ]

  if (e && !admin && !attend) {
    pipeline.push({
      $match: { 'member.parentEmail': e },
    })
  }

  const rows = await Registration.aggregate(pipeline)
  const scope = admin ? 'admin' : attend ? 'attend' : 'public'
  return { success: true, registrations: rows.map((r) => serialize(r, scope)) }
}

/** Session roster for scanner — attend auth required at route level. */
export async function getSessionScanData(sessionId) {
  const sid = String(sessionId || '').trim()
  if (!sid) return { success: false, error: 'sessionId required' }

  const regResult = await getAllRegistrations({ sessionId: sid, attend: true })
  if (!regResult.success) return regResult

  const memberIds = [
    ...new Set(
      regResult.registrations
        .map((r) => r.memberId)
        .filter(Boolean)
        .map(String)
    ),
  ]

  let members = []
  if (memberIds.length) {
    const oids = memberIds
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id))
    const rows = oids.length ? await Member.find({ _id: { $in: oids } }).lean() : []
    members = rows.map(serializeMemberAttend)
  }

  return {
    success: true,
    registrations: regResult.registrations,
    members,
  }
}

/**
 * Save a registration.
 *
 * The frontend still sends member profile fields on this endpoint; the
 * backend uses them to:
 *   1. Find the member (by memberId, badgeId, or name+email)
 *   2. Or auto-create a Member row if none exists (matches the old GAS flow
 *      where registering also populated the validation sheet).
 *
 * The Registration row itself stores only the memberId reference + session
 * info + payment info.
 */
export async function saveRegistration(data) {
  if (!data) return { success: false, error: 'Registration data required' }
  if (!data.sessionId) return { success: false, error: 'sessionId required' }

  const session = await Session.findOne({ id: String(data.sessionId) }).lean()
  if (!session) return { success: false, error: 'Session not found' }

  const resolved = await findOrCreateMember(data)
  if (!resolved) return { success: false, error: 'Unable to resolve member' }

  if (resolved.type === 'pending') {
    return {
      success: false,
      error:
        'This account is awaiting admin approval. You cannot register for sessions until it is approved.',
      approvalStatus: 'pending',
    }
  }
  if (resolved.type === 'rejected') {
    return {
      success: false,
      error:
        'This account was not approved. Please contact an administrator.',
      approvalStatus: 'rejected',
      rejectedReason: resolved.pending?.rejectedReason || '',
    }
  }

  const member = resolved.member

  // Branch guard: a member can only register for a session whose branch is
  // one of their own branches OR a branch linked to one of their branches.
  // Sessions with no branchId are treated as "legacy / global" and stay
  // registerable, so existing data isn't broken by this feature.
  if (session.branchId) {
    const memberBranches = Array.isArray(member.branchIds) ? member.branchIds : []
    if (!memberBranches.length) {
      return {
        success: false,
        error:
          'Your account is not assigned to any branch yet. Ask an administrator to add you to the branch that runs this workshop.',
      }
    }
    const visible = await expandVisibleBranchIds(memberBranches)
    if (!visible.includes(session.branchId)) {
      const branch = await Branch.findOne({ id: session.branchId }).lean()
      const branchName = branch ? branch.name || branch.id : session.branchId
      return {
        success: false,
        error: `This workshop is hosted at "${branchName}", which isn't one of your branches. Ask an admin to link the branches if you should have access.`,
      }
    }
  }

  const existing = await Registration.findOne({
    memberId: member._id,
    sessionId: session.id,
  }).lean()
  if (existing) {
    return {
      success: false,
      error: 'This member is already registered for this session',
      id: existing.id,
    }
  }

  // Capacity check: only count confirmed spots (session.reg[] = paid or free)
  const confirmedCount = Array.isArray(session.reg) ? session.reg.length : 0
  if (confirmedCount >= session.capacity) {
    return { success: false, error: 'This session is full' }
  }

  const pricing = computePrice(session, member)
  const id = data.id || 'REG' + Date.now().toString(36) + nanoid(6).toUpperCase()

  const created = await Registration.create({
    id,
    memberId: member._id,
    sessionId: session.id,
    sessionDate: String(data.sessionDate || ''),
    sessionTime: String(data.sessionTime || ''),
    sessionTopic: String(data.sessionTopic || session.topic || ''),
    registeredBy: str(data.registeredBy),
    registeredDateAndTime: data.registeredDateAndTime
      ? new Date(data.registeredDateAndTime)
      : new Date(),
    priceAmount: pricing.amount,
    currency: pricing.currency,
    membershipType: pricing.membershipType,
    paymentStatus: pricing.status,
  })

  // Only confirm the registration (add to session.reg[] + send email) once
  // payment is complete. Free registrations are confirmed immediately.
  if (pricing.isFree) {
    await Session.updateOne(
      { id: session.id },
      { $addToSet: { reg: created.id } }
    )
    const branch = session.branchId
      ? await Branch.findOne({ id: session.branchId }).lean()
      : null
    try {
      await sendRegistrationConfirmationEmail(member, session, branch, created.id, created)
      await Registration.updateOne({ id: created.id }, { confirmationEmailSentAt: new Date() })
    } catch (err) {
      console.error('[register] confirmation email failed:', err.message)
    }
  }

  return {
    success: true,
    message: 'Registration saved',
    id: created.id,
    memberId: String(member._id),
    priceAmount: created.priceAmount,
    currency: created.currency,
    membershipType: created.membershipType,
    paymentStatus: created.paymentStatus,
    isFree: pricing.isFree,
    pricingNote: pricing.note,
  }
}

export async function updateRegistration(data) {
  if (!data || !data.id) return { success: false, error: 'Registration id required' }

  // Historically this endpoint was used to set badgeId on a specific
  // registration. Since badgeId now lives on Member, route it there instead
  // when no registration-specific field is provided.
  if (data.badgeId != null && !data.paymentStatus && !data.paymentId) {
    const reg = await Registration.findOne({ id: data.id }).lean()
    if (!reg) return { success: false, error: 'Registration not found' }
    await Member.updateOne({ _id: reg.memberId }, { $set: { badgeId: str(data.badgeId) } })
    return {
      success: true,
      message: 'Badge assigned to member (applies to all their registrations)',
      id: reg.id,
      memberId: String(reg.memberId),
    }
  }

  const update = {}
  if (data.paymentStatus) update.paymentStatus = data.paymentStatus
  if (data.paymentId) update.paymentId = data.paymentId
  if (data.paidAt) update.paidAt = new Date(data.paidAt)

  const doc = await Registration.findOneAndUpdate({ id: data.id }, update, { new: true })
  if (!doc) return { success: false, error: 'Registration not found' }
  return { success: true, message: 'Registration updated', id: doc.id }
}

/**
 * With the new reference model, assigning a badge to a user is a single-
 * document update on Member. All past and future registrations automatically
 * reflect it through the join.
 */
export async function updateAllRegistrationsForUser(data) {
  if (!data) return { success: false, error: 'User data required' }
  const firstName = str(data.firstName)
  const lastName = str(data.lastName)
  const parentEmail = str(data.parentEmail).toLowerCase()
  const badgeId = str(data.badgeId)
  if (!firstName || !lastName || !parentEmail || !badgeId) {
    return {
      success: false,
      error: 'firstName, lastName, parentEmail, badgeId are required',
    }
  }

  const member = await Member.findOneAndUpdate(
    {
      firstName: new RegExp(`^${escapeRe(firstName)}$`, 'i'),
      lastName: new RegExp(`^${escapeRe(lastName)}$`, 'i'),
      parentEmail,
    },
    { $set: { badgeId } },
    { new: true }
  )
  if (!member) return { success: false, error: 'Member not found', updatedCount: 0 }

  const regCount = await Registration.countDocuments({ memberId: member._id })
  return {
    success: true,
    message: `Badge assigned to ${firstName} ${lastName} (${regCount} registration(s) now reflect it)`,
    updatedCount: regCount,
    memberId: String(member._id),
  }
}

export async function deleteRegistration(registrationId) {
  if (!registrationId) return { success: false, error: 'Registration id required' }

  // Fetch member + session before deleting so we can send the cancellation email
  const regDoc = await Registration.findOne({ id: String(registrationId) }).lean()
  if (!regDoc) return { success: false, error: 'Registration not found' }

  const [cancelMember, cancelSession] = await Promise.all([
    Member.findById(regDoc.memberId).lean(),
    Session.findOne({ id: regDoc.sessionId }).lean(),
  ])

  const reg = await Registration.findOneAndDelete({ id: String(registrationId) })
  if (!reg) return { success: false, error: 'Registration not found' }

  if (reg.sessionId) {
    await Session.updateOne(
      { id: reg.sessionId },
      { $pull: { reg: reg.id } }
    )
  }

  // Send cancellation email to parent (fire-and-forget)
  if (cancelMember && cancelSession) {
    const cancelBranch = cancelSession.branchId
      ? await Branch.findOne({ id: cancelSession.branchId }).lean()
      : null
    sendCancellationConfirmationEmail(cancelMember, cancelSession, cancelBranch, regDoc.id).catch(() => {})
  }

  return {
    success: true,
    message: 'Registration deleted',
    registrationId: reg.id,
    sessionId: reg.sessionId,
  }
}

export async function recordAttendance({ sessionId, badge, seat }) {
  if (!sessionId || !badge)
    return { success: false, error: 'sessionId and badge required' }
  const now = new Date()
  const res = await Session.updateOne(
    { id: sessionId, 'att.badge': { $ne: badge } },
    { $push: { att: { badge, seat: seat || '', ts: now } } }
  )
  return { success: true, added: res.modifiedCount > 0 }
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

/**
 * Resolve who is being registered and tell the caller which "bucket" they
 * live in. Returns one of:
 *
 *   { type: 'approved', member }   – real, approved Member (ok to register)
 *   { type: 'pending',  pending }  – waiting for admin approval (block)
 *   { type: 'rejected', pending }  – admin rejected this sign-up (block)
 *   null                           – not enough info to resolve anyone
 *
 * Order of precedence:
 *   1. explicit data.memberId (may point to either collection)
 *   2. badgeId (approved members only — pending accounts have no badge yet)
 *   3. firstName + lastName + parentEmail (checked in both collections)
 *   4. otherwise create a new PendingMember from the provided fields
 *
 * This function intentionally never creates a row in the `members`
 * collection — approval has to go through the admin Approvals page, which
 * copies the row over via `approveMember()`.
 */
async function findOrCreateMember(data) {
  if (data.memberId && mongoose.Types.ObjectId.isValid(String(data.memberId))) {
    const m = await Member.findById(data.memberId)
    if (m) return { type: 'approved', member: m }
    const p = await PendingMember.findById(data.memberId)
    if (p) return { type: p.status || 'pending', pending: p }
  }

  const badgeId = str(data.badgeId)
  if (badgeId) {
    const m = await Member.findOne({ badgeId })
    if (m) return { type: 'approved', member: m }
  }

  const firstName = str(data.firstName)
  const lastName = str(data.lastName)
  const parentEmail = str(data.parentEmail).toLowerCase()

  if (firstName && lastName && parentEmail) {
    const m = await Member.findOne({
      firstName: new RegExp(`^${escapeRe(firstName)}$`, 'i'),
      lastName: new RegExp(`^${escapeRe(lastName)}$`, 'i'),
      parentEmail,
    })
    if (m) {
      if (badgeId && !m.badgeId) {
        m.badgeId = badgeId
        await m.save()
      }
      return { type: 'approved', member: m }
    }

    const p = await PendingMember.findOne({
      firstName: new RegExp(`^${escapeRe(firstName)}$`, 'i'),
      lastName: new RegExp(`^${escapeRe(lastName)}$`, 'i'),
      parentEmail,
    })
    if (p) return { type: p.status || 'pending', pending: p }
  }

  if (!firstName || !lastName || !parentEmail) {
    return null
  }

  const created = await PendingMember.create({
    firstName,
    lastName,
    familyRole: str(data.familyRole),
    age: str(data.age),
    house: str(data.house),
    level: str(data.level),
    school: str(data.school),
    parent: str(data.parent),
    parentEmail,
    phoneNumber: str(data.phoneNumber),
    membershipType: ['yearly', 'semi-yearly', 'none'].includes(data.membershipType)
      ? data.membershipType
      : 'none',
    branchIds: Array.isArray(data.branchIds)
      ? [...new Set(data.branchIds.map((x) => String(x || '').trim()).filter(Boolean))]
      : [],
    status: 'pending',
  })
  return { type: 'pending', pending: created }
}

/**
 * Flatten a Registration + joined member into the shape the frontend expects.
 * @param {'public'|'attend'|'admin'} scope
 */
function serialize(r, scope = 'admin') {
  const m = r.member || {}
  const s = r.session || {}
  const base = {
    id: r.id,
    memberId: r.memberId ? String(r.memberId) : '',

    sessionId: r.sessionId,
    sessionDate: r.sessionDate,
    sessionTime: r.sessionTime,
    sessionTopic: r.sessionTopic,
    branchId: s.branchId || '',

    badgeId: m.badgeId || '',
    firstName: m.firstName || '',
    lastName: m.lastName || '',
    parentEmail: m.parentEmail || '',

    registeredBy: r.registeredBy || '',
    registeredDateAndTime: r.registeredDateAndTime
      ? new Date(r.registeredDateAndTime).toISOString()
      : '',

    priceAmount: Number(r.priceAmount || 0),
    currency: r.currency || 'USD',
    membershipType: r.membershipType || 'none',
    paymentStatus: r.paymentStatus || 'not_required',
  }

  if (scope === 'public') {
    return {
      ...base,
      paymentCheckoutUrl: r.paymentCheckoutUrl || '',
    }
  }

  if (scope === 'attend') {
    return {
      ...base,
      familyRole: m.familyRole || '',
      phoneNumber: m.phoneNumber || '',
      branchIds: Array.isArray(m.branchIds) ? m.branchIds.filter(Boolean) : [],
    }
  }

  return {
    ...base,
    branchIds: Array.isArray(m.branchIds) ? m.branchIds.filter(Boolean) : [],
    familyRole: m.familyRole || '',
    age: m.age || '',
    house: m.house || '',
    level: m.level || '',
    school: m.school || '',
    parent: m.parent || '',
    phoneNumber: m.phoneNumber || '',
    paymentProvider: r.paymentProvider || '',
    paymentId: r.paymentId || '',
    paymentCheckoutUrl: r.paymentCheckoutUrl || '',
    paidAt: r.paidAt ? new Date(r.paidAt).toISOString() : null,
  }
}

function str(v) {
  return (v == null ? '' : String(v)).trim()
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
