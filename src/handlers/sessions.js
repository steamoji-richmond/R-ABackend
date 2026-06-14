import { nanoid } from 'nanoid'
import Session from '../models/Session.js'
import Registration from '../models/Registration.js'
import Member from '../models/Member.js'
import Branch from '../models/Branch.js'
import { sendSessionDeletedEmail } from '../services/email.js'

/**
 * List sessions. When `branchIds` is a non-empty array we return only
 * sessions that belong to one of those branches (plus legacy sessions with
 * no branchId set, so existing data keeps working during migration).
 */
export async function getAllSessions({ branchIds } = {}) {
  const filter =
    Array.isArray(branchIds) && branchIds.length
      ? { $or: [{ branchId: { $in: branchIds } }, { branchId: '' }, { branchId: null }] }
      : {}
  const rows = await Session.find(filter).sort({ dt: 1 }).lean()
  return {
    success: true,
    sessions: rows.map(serialize),
  }
}

export async function saveSession(data) {
  if (!data) return { success: false, error: 'Session data required' }
  const id = data.id || 'S' + nanoid(9)
  const payload = {
    id,
    dt: data.dt ? new Date(data.dt) : new Date(),
    topic: String(data.topic || 'Public Speaking').trim(),
    capacity: Math.max(1, Number(data.capacity) || 10),
    price: Math.max(0, Number(data.price) || 0),
    currency: 'CAD',
    branchId: data.branchId == null ? undefined : String(data.branchId).trim(),
    reg: Array.isArray(data.reg)
      ? data.reg.map(String)
      : typeof data.reg === 'string'
      ? safeArr(data.reg)
      : [],
    att: Array.isArray(data.att)
      ? data.att
      : typeof data.att === 'string'
      ? safeArr(data.att)
      : [],
  }
  // Drop undefined so the caller can omit branchId on update without
  // accidentally wiping it.
  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k])

  const doc = await Session.findOneAndUpdate({ id }, payload, {
    new: true,
    upsert: true,
    setDefaultsOnInsert: true,
  })
  return { success: true, message: 'Session saved', session: serialize(doc.toObject()) }
}

export async function saveAllSessions(sessions) {
  if (!Array.isArray(sessions)) return { success: false, error: 'Sessions array required' }
  const ops = sessions.map((s) => {
    const set = {
      id: s.id || 'S' + nanoid(9),
      dt: s.dt ? new Date(s.dt) : new Date(),
      topic: String(s.topic || 'Public Speaking').trim(),
      capacity: Math.max(1, Number(s.capacity) || 10),
      price: Math.max(0, Number(s.price) || 0),
      currency: (s.currency || 'USD').toUpperCase(),
      reg: Array.isArray(s.reg) ? s.reg : safeArr(s.reg),
      att: Array.isArray(s.att) ? s.att : safeArr(s.att),
    }
    if (s.branchId != null) set.branchId = String(s.branchId).trim()
    return {
      updateOne: { filter: { id: s.id }, update: { $set: set }, upsert: true },
    }
  })
  if (ops.length) await Session.bulkWrite(ops, { ordered: false })
  return { success: true, message: `Saved ${ops.length} sessions` }
}

export async function deleteSession(sessionId, reason) {
  if (!sessionId) return { success: false, error: 'Session ID required' }

  // Load session + registrations before deleting so we can email members
  const session = await Session.findOne({ id: String(sessionId) }).lean()
  const registrations = session
    ? await Registration.find({ sessionId: String(sessionId) }).lean()
    : []

  // Delete registrations and session
  const delRegs = await Registration.deleteMany({ sessionId: String(sessionId) })
  const res = await Session.deleteOne({ id: String(sessionId) })

  // Fire-and-forget emails to each registered member
  if (session && registrations.length) {
    const branch = session.branchId
      ? await Branch.findOne({ id: session.branchId }).lean()
      : null

    const memberIds = [...new Set(registrations.map((r) => r.memberId).filter(Boolean))]
    const members = await Member.find({ _id: { $in: memberIds } }).lean()
    const memberMap = new Map(members.map((m) => [String(m._id), m]))

    for (const reg of registrations) {
      const member = memberMap.get(String(reg.memberId))
      if (!member?.parentEmail) continue
      sendSessionDeletedEmail(member, session, branch, reason || '', reg.id).catch(() => {})
    }
  }

  return {
    success: true,
    message: 'Session deleted',
    deletedRegistrations: delRegs.deletedCount || 0,
    sessionDeleted: res.deletedCount > 0,
    emailedMembers: registrations.length,
  }
}

function serialize(s) {
  return {
    id: s.id,
    dt: s.dt instanceof Date ? s.dt.toISOString() : s.dt,
    topic: s.topic,
    capacity: s.capacity,
    price: Number(s.price || 0),
    currency: 'CAD',
    branchId: s.branchId || '',
    reg: Array.isArray(s.reg) ? s.reg : [],
    att: Array.isArray(s.att) ? s.att : [],
  }
}

function safeArr(v) {
  if (!v) return []
  try {
    const p = typeof v === 'string' ? JSON.parse(v) : v
    return Array.isArray(p) ? p : []
  } catch {
    return []
  }
}
