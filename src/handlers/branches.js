import { nanoid } from 'nanoid'
import Branch, { serializeBranch } from '../models/Branch.js'
import Member from '../models/Member.js'
import PendingMember from '../models/PendingMember.js'
import Session from '../models/Session.js'

/**
 * Expand a list of branch ids into the full set of ids the member is
 * allowed to see — i.e. their own branches plus every branch those
 * branches are linked to. Used by the registration filter and by the
 * lookup response so the frontend can show the correct sessions.
 */
export async function expandVisibleBranchIds(branchIds) {
  const ids = Array.isArray(branchIds) ? branchIds.filter(Boolean) : []
  if (ids.length === 0) return []
  const rows = await Branch.find({
    id: { $in: ids },
    active: { $ne: false },
  }).lean()
  const out = new Set(ids)
  for (const b of rows) {
    for (const linked of b.linkedBranchIds || []) {
      if (linked) out.add(String(linked))
    }
  }
  return [...out]
}

export async function getAllBranches({ activeOnly = false, admin = false } = {}) {
  const filter = activeOnly ? { active: { $ne: false } } : {}
  const rows = await Branch.find(filter).sort({ name: 1 }).lean()
  return {
    success: true,
    branches: rows.map((b) => serializeBranch(b, { admin })),
  }
}

export async function getBranch(id, { admin = false } = {}) {
  if (!id) return { success: false, error: 'Branch id required' }
  const row = await Branch.findOne({ id: String(id) }).lean()
  if (!row) return { success: false, error: 'Branch not found' }
  return { success: true, branch: serializeBranch(row, { admin }) }
}

export async function saveBranch(data) {
  if (!data) return { success: false, error: 'Branch data required' }
  const name = str(data.name)
  if (!name && !data.id) return { success: false, error: 'Branch name required' }

  const id = data.id ? String(data.id).trim() : 'B' + nanoid(9)

  // If the name matches another branch, refuse (unique-by-name is the
  // friendly constraint; unique id is the DB-level one).
  if (name) {
    const dup = await Branch.findOne({
      name: new RegExp(`^${escapeRe(name)}$`, 'i'),
      id: { $ne: id },
    }).lean()
    if (dup) return { success: false, error: 'A branch with this name already exists' }
  }

  const payload = {
    id,
    name: name || undefined,
    code: str(data.code),
    organizationId: str(data.organizationId),
    steamojiAuthToken: str(data.steamojiAuthToken),
    steamojiAuthCookie: str(data.steamojiAuthCookie),
    address: str(data.address),
    city: str(data.city),
    region: str(data.region),
    country: str(data.country),
    phone: str(data.phone),
    email: str(data.email).toLowerCase(),
    gmailAppPass: str(data.gmailAppPass).replace(/\s+/g, ''), // strip spaces (Google displays them with spaces)
    squareEnv: ['sandbox', 'production'].includes(str(data.squareEnv))
      ? str(data.squareEnv)
      : 'sandbox',
    squareAccessToken: str(data.squareAccessToken),
    squareLocationId: str(data.squareLocationId),
    squareApplicationId: str(data.squareApplicationId),
    active: data.active === undefined ? undefined : !!data.active,
  }
  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k])

  const doc = await Branch.findOneAndUpdate({ id }, payload, {
    new: true,
    upsert: true,
    setDefaultsOnInsert: true,
  })
  return {
    success: true,
    message: data.id ? 'Branch updated' : 'Branch created',
    branch: serializeBranch(doc.toObject(), { admin: true }),
  }
}

export async function deleteBranch(id, { force = false } = {}) {
  if (!id) return { success: false, error: 'Branch id required' }
  const bid = String(id)

  // Hard-block deletion if anything still depends on this branch, so admins
  // don't leave orphaned sessions or members. If they really need to, they
  // can deactivate or pass `force: true`.
  const [sessionCount, memberCount, pendingCount] = await Promise.all([
    Session.countDocuments({ branchId: bid }),
    Member.countDocuments({ branchIds: bid }),
    PendingMember.countDocuments({ branchIds: bid }),
  ])
  if (!force && (sessionCount || memberCount || pendingCount)) {
    return {
      success: false,
      error:
        `Cannot delete: ${sessionCount} session(s), ${memberCount} member(s), ` +
        `${pendingCount} pending sign-up(s) still belong to this branch. ` +
        `Move them to another branch first, or deactivate this branch instead.`,
      sessionCount,
      memberCount,
      pendingCount,
    }
  }

  // Un-link from every other branch so we don't leave dangling references.
  await Branch.updateMany(
    { linkedBranchIds: bid },
    { $pull: { linkedBranchIds: bid } }
  )

  const res = await Branch.deleteOne({ id: bid })
  return {
    success: res.deletedCount > 0,
    message: res.deletedCount > 0 ? 'Branch deleted' : 'Branch not found',
  }
}

/**
 * Change the `active` flag on a branch without touching anything else.
 * Useful when a location is temporarily closed but admins still need it
 * to show up in reports / old sessions.
 */
export async function setBranchActive(id, active) {
  if (!id) return { success: false, error: 'Branch id required' }
  const doc = await Branch.findOneAndUpdate(
    { id: String(id) },
    { $set: { active: !!active } },
    { new: true }
  )
  if (!doc) return { success: false, error: 'Branch not found' }
  return {
    success: true,
    message: active ? 'Branch activated' : 'Branch deactivated',
    branch: serializeBranch(doc.toObject(), { admin: true }),
  }
}

/**
 * Link `id` to every branch in `otherIds`, symmetrically (both sides updated).
 * `action` = 'add' | 'remove' | 'set':
 *   - add    → union of existing + otherIds
 *   - remove → existing minus otherIds
 *   - set    → exactly otherIds (replaces anything else the branch was linked to)
 */
export async function linkBranches(id, otherIds, action = 'add') {
  if (!id) return { success: false, error: 'Branch id required' }
  const bid = String(id)
  const others = (Array.isArray(otherIds) ? otherIds : [])
    .map((x) => String(x || '').trim())
    .filter((x) => x && x !== bid)

  const branch = await Branch.findOne({ id: bid })
  if (!branch) return { success: false, error: 'Branch not found' }

  if (others.length) {
    const existing = await Branch.find({ id: { $in: others } })
      .select('id')
      .lean()
    const existingIds = new Set(existing.map((b) => b.id))
    const missing = others.filter((x) => !existingIds.has(x))
    if (missing.length) {
      return {
        success: false,
        error: `Unknown branch id(s): ${missing.join(', ')}`,
      }
    }
  }

  const current = new Set(branch.linkedBranchIds || [])
  let next
  if (action === 'remove') {
    for (const x of others) current.delete(x)
    next = [...current]
  } else if (action === 'set') {
    next = [...new Set(others)]
  } else {
    for (const x of others) current.add(x)
    next = [...current]
  }
  branch.linkedBranchIds = next
  await branch.save()

  // Mirror on the other side. For `set` we compute per-branch because it's
  // only defined as "add this one to those, remove from everyone else".
  if (action === 'set') {
    await Branch.updateMany(
      { id: { $in: next } },
      { $addToSet: { linkedBranchIds: bid } }
    )
    await Branch.updateMany(
      { id: { $nin: [...next, bid] }, linkedBranchIds: bid },
      { $pull: { linkedBranchIds: bid } }
    )
  } else if (action === 'remove') {
    await Branch.updateMany(
      { id: { $in: others } },
      { $pull: { linkedBranchIds: bid } }
    )
  } else {
    await Branch.updateMany(
      { id: { $in: others } },
      { $addToSet: { linkedBranchIds: bid } }
    )
  }

  const updated = await Branch.findOne({ id: bid }).lean()
  return {
    success: true,
    message: 'Branch links updated',
    branch: serializeBranch(updated, { admin: true }),
  }
}

function str(v) {
  return (v == null ? '' : String(v)).trim()
}
function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
