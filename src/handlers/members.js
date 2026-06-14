import Member from '../models/Member.js'
import PendingMember from '../models/PendingMember.js'
import Branch from '../models/Branch.js'
import ImportConflict from '../models/ImportConflict.js'
import Registration from '../models/Registration.js'
import Session from '../models/Session.js'
import mongoose from 'mongoose'
import { config } from '../config.js'
import { expandVisibleBranchIds } from './branches.js'

const APPROVAL_STATUSES = ['pending', 'approved', 'rejected']

function normalizeBranchIds(v) {
  if (v == null) return undefined
  const arr = Array.isArray(v) ? v : String(v).split(',')
  const out = [
    ...new Set(
      arr
        .map((x) => String(x == null ? '' : x).trim())
        .filter(Boolean)
    ),
  ]
  return out
}

/**
 * Shared output shape the frontend already speaks. A row sourced from the
 * `members` collection is always `approvalStatus: 'approved'`; a row sourced
 * from `pendingmembers` reports its own pending/rejected status.
 */
function serializeMember(m) {
  return {
    ...m,
    _id: String(m._id),
    _rowIndex: String(m._id),
    badgeId: m.badgeId || '',
    membershipOverride: m.membershipOverride || false,
    branchIds: Array.isArray(m.branchIds) ? m.branchIds.filter(Boolean) : [],
    approvalStatus: 'approved',
    approvedAt: m.approvedAt || null,
    approvedBy: m.approvedBy || '',
    rejectedReason: '',
  }
}

function serializePending(p) {
  return {
    _id: String(p._id),
    _rowIndex: String(p._id),
    badgeId: '',
    firstName: p.firstName || '',
    lastName: p.lastName || '',
    familyRole: p.familyRole || '',
    age: p.age || '',
    house: p.house || '',
    level: p.level || '',
    school: p.school || '',
    parent: p.parent || '',
    parentEmail: p.parentEmail || '',
    phoneNumber: p.phoneNumber || '',
    membershipType: p.membershipType || 'none',
    branchIds: Array.isArray(p.branchIds) ? p.branchIds.filter(Boolean) : [],
    approvalStatus: p.status || 'pending',
    approvedAt: p.reviewedAt || null,
    approvedBy: p.reviewedBy || '',
    rejectedReason: p.rejectedReason || '',
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }
}

export async function lookupByEmail(email) {
  if (!email) return { success: false, error: 'email is required' }
  const e = String(email).toLowerCase().trim()
  const [memberRows, pendingRows] = await Promise.all([
    Member.find({ parentEmail: e }).lean(),
    PendingMember.find({ parentEmail: e }).lean(),
  ])

  const allBranchIds = new Set()
  for (const m of [...memberRows, ...pendingRows]) {
    for (const b of m.branchIds || []) if (b) allBranchIds.add(b)
  }
  const expanded = await expandVisibleBranchIds([...allBranchIds])

  // Per-member "visible" set = their branches ∪ branches linked to any of them.
  // The frontend uses this to filter sessions down to the ones the member
  // is actually allowed to register for.
  const attachVisible = async (ids) => expandVisibleBranchIds(ids || [])

  const members = await Promise.all([
    ...memberRows.map(async (m) => ({
      ...serializeMember(m),
      parentEmail: m.parentEmail || e,
      visibleBranchIds: await attachVisible(m.branchIds),
    })),
    ...pendingRows.map(async (p) => ({
      ...serializePending(p),
      parentEmail: p.parentEmail || e,
      visibleBranchIds: await attachVisible(p.branchIds),
    })),
  ])

  return {
    success: true,
    members,
    branchIds: [...allBranchIds],
    visibleBranchIds: expanded,
  }
}

/**
 * Returns ONLY the approved members. Admin authentication required.
 */
export async function getAllValidation() {
  const rows = await Member.find().sort({ createdAt: -1 }).lean()
  return {
    success: true,
    members: rows.map(serializeMember),
  }
}

/** Look up a single member by badge — attendance staff only. */
export async function lookupBadge(badge) {
  const id = String(badge || '').trim()
  if (!id) return { success: false, error: 'badge is required' }
  const row = await Member.findOne({ badgeId: id }).lean()
  return {
    success: true,
    member: row ? serializeMemberAttend(row) : null,
  }
}

function serializeMemberAttend(m) {
  return {
    _id: String(m._id),
    _rowIndex: String(m._id),
    badgeId: m.badgeId || '',
    firstName: m.firstName || '',
    lastName: m.lastName || '',
    parentEmail: m.parentEmail || '',
    membershipType: m.membershipType || 'none',
  }
}

export { serializeMemberAttend }

export async function getPendingMembers() {
  const rows = await PendingMember.find({ status: 'pending' })
    .sort({ createdAt: -1 })
    .lean()
  return {
    success: true,
    members: rows.map(serializePending),
  }
}

/**
 * Upsert a member.
 *
 *  - If the caller marks `approvalStatus: 'pending'` (i.e. the public sign-up
 *    form), the record lands in the `pendingmembers` collection and awaits
 *    admin review.
 *  - Otherwise (admin "Add member" flow), it goes straight into `members`.
 *  - Editing an existing record routes to whichever collection currently
 *    owns the id.
 */
export async function upsertValidation(data) {
  if (!data) return { success: false, error: 'Member data required' }

  const payload = {
    badgeId: str(data.badgeId),
    firstName: str(data.firstName),
    lastName: str(data.lastName),
    familyRole: str(data.familyRole),
    age: str(data.age),
    house: str(data.house),
    level: str(data.level),
    school: str(data.school),
    parent: str(data.parent),
    parentEmail: str(data.parentEmail).toLowerCase(),
    phoneNumber: str(data.phoneNumber),
    membershipType: ['yearly', 'semi-yearly', 'none'].includes(data.membershipType)
      ? data.membershipType
      : undefined,
    membershipOverride: data.membershipOverride === true
      ? true
      : data.membershipOverride === false
        ? false
        : undefined,
    branchIds: normalizeBranchIds(data.branchIds),
  }
  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k])

  const requestedStatus = APPROVAL_STATUSES.includes(data.approvalStatus)
    ? data.approvalStatus
    : null

  const rowIdRaw = data._rowIndex || data._id
  const rowId =
    rowIdRaw && mongoose.Types.ObjectId.isValid(String(rowIdRaw))
      ? String(rowIdRaw)
      : null

  if (rowId) {
    const memberDoc = await Member.findByIdAndUpdate(rowId, payload, { new: true })
    if (memberDoc) {
      return {
        success: true,
        message: 'Member updated',
        _rowIndex: String(memberDoc._id),
        approvalStatus: 'approved',
      }
    }
    const pendingPayload = { ...payload }
    delete pendingPayload.badgeId
    const pendingDoc = await PendingMember.findByIdAndUpdate(rowId, pendingPayload, {
      new: true,
    })
    if (pendingDoc) {
      return {
        success: true,
        message: 'Pending member updated',
        _rowIndex: String(pendingDoc._id),
        approvalStatus: pendingDoc.status || 'pending',
      }
    }
    return { success: false, error: 'Member not found' }
  }

  const identity = {
    firstName: payload.firstName,
    lastName: payload.lastName,
    parentEmail: payload.parentEmail,
  }
  const hasIdentity = identity.firstName && identity.lastName && identity.parentEmail

  if (requestedStatus === 'pending') {
    if (hasIdentity) {
      const existingMember = await Member.findOne(identity)
      if (existingMember) {
        return {
          success: true,
          message: 'Account already approved',
          _rowIndex: String(existingMember._id),
          approvalStatus: 'approved',
        }
      }
      const existingPending = await PendingMember.findOne(identity)
      if (existingPending) {
        Object.assign(existingPending, payload, {
          status: 'pending',
          rejectedReason: '',
        })
        delete existingPending.badgeId
        await existingPending.save()
        return {
          success: true,
          message: 'Pending sign-up updated',
          _rowIndex: String(existingPending._id),
          approvalStatus: 'pending',
        }
      }
    }
    const created = await PendingMember.create({
      ...payload,
      status: 'pending',
      submittedBy: str(data.submittedBy),
    })
    return {
      success: true,
      message: 'Sign-up submitted for admin approval',
      _rowIndex: String(created._id),
      approvalStatus: 'pending',
    }
  }

  if (hasIdentity) {
    const existing = await Member.findOne(identity)
    if (existing) {
      Object.assign(existing, payload)
      await existing.save()
      return {
        success: true,
        message: 'Existing member updated',
        _rowIndex: String(existing._id),
        approvalStatus: 'approved',
      }
    }
  }

  const created = await Member.create(payload)
  return {
    success: true,
    message: 'Member added',
    _rowIndex: String(created._id),
    approvalStatus: 'approved',
  }
}

export async function deleteValidation(rowIndex) {
  if (!rowIndex || !mongoose.Types.ObjectId.isValid(String(rowIndex))) {
    return { success: false, error: 'Valid rowIndex required' }
  }

  const member = await Member.findByIdAndDelete(rowIndex)
  if (member) {
    // Remove all registrations for this member and pull their IDs from session.reg[]
    const regs = await Registration.find({ memberId: member._id }).lean()
    if (regs.length) {
      const regIds = regs.map((r) => r.id)
      await Registration.deleteMany({ memberId: member._id })
      // Update every affected session in one query per session
      const sessionIds = [...new Set(regs.map((r) => r.sessionId).filter(Boolean))]
      await Session.updateMany(
        { id: { $in: sessionIds } },
        { $pull: { reg: { $in: regIds } } }
      )
    }
    return {
      success: true,
      message: 'Member deleted',
      deletedRegistrations: regs.length,
    }
  }

  const pending = await PendingMember.findByIdAndDelete(rowIndex)
  if (pending) return { success: true, message: 'Pending sign-up deleted' }

  return { success: false, error: 'Member not found' }
}

/**
 * Approve a pending sign-up: copy the record into `members` and remove it
 * from `pendingmembers`. Safe to call twice — if the row is already gone
 * from `pendingmembers` but exists in `members`, we treat it as a no-op.
 */
export async function approveMember(memberId, approvedBy = '') {
  if (!memberId || !mongoose.Types.ObjectId.isValid(String(memberId))) {
    return { success: false, error: 'Valid memberId required' }
  }

  const pending = await PendingMember.findById(memberId)
  if (!pending) {
    const existing = await Member.findById(memberId)
    if (existing) {
      return {
        success: true,
        message: 'Already approved',
        member: serializeMember(existing.toObject()),
      }
    }
    return { success: false, error: 'Pending member not found' }
  }

  const identity = {
    firstName: pending.firstName,
    lastName: pending.lastName,
    parentEmail: pending.parentEmail,
  }
  let memberDoc = null
  if (identity.firstName && identity.lastName && identity.parentEmail) {
    memberDoc = await Member.findOne(identity)
  }

  if (!memberDoc) {
    memberDoc = await Member.create({
      firstName: pending.firstName,
      lastName: pending.lastName,
      familyRole: pending.familyRole,
      age: pending.age,
      house: pending.house,
      level: pending.level,
      school: pending.school,
      parent: pending.parent,
      parentEmail: pending.parentEmail,
      phoneNumber: pending.phoneNumber,
      membershipType: pending.membershipType || 'none',
      branchIds: Array.isArray(pending.branchIds) ? pending.branchIds : [],
      approvedAt: new Date(),
      approvedBy: str(approvedBy),
    })
  } else {
    memberDoc.approvedAt = new Date()
    memberDoc.approvedBy = str(approvedBy)
    // Merge branches from the pending sign-up so we don't lose the branches
    // the user picked on the sign-up form when they re-applied on top of an
    // existing approved record.
    if (Array.isArray(pending.branchIds) && pending.branchIds.length) {
      const merged = new Set([...(memberDoc.branchIds || []), ...pending.branchIds])
      memberDoc.branchIds = [...merged]
    }
    await memberDoc.save()
  }

  await PendingMember.deleteOne({ _id: pending._id })

  return {
    success: true,
    message: 'Member approved',
    member: serializeMember(memberDoc.toObject()),
  }
}

/**
 * Reject a pending sign-up: update the PendingMember row in place with
 * `status: 'rejected'` + reason. The record is NOT copied into `members`,
 * so it never shows up in the members list or in registrations.
 */
export async function rejectMember(memberId, reason = '', rejectedBy = '') {
  if (!memberId || !mongoose.Types.ObjectId.isValid(String(memberId))) {
    return { success: false, error: 'Valid memberId required' }
  }
  const doc = await PendingMember.findByIdAndUpdate(
    memberId,
    {
      status: 'rejected',
      reviewedAt: new Date(),
      reviewedBy: str(rejectedBy),
      rejectedReason: str(reason),
    },
    { new: true }
  )
  if (!doc) return { success: false, error: 'Pending member not found' }
  return {
    success: true,
    message: 'Member rejected',
    member: serializePending(doc.toObject()),
  }
}

function str(v) {
  return (v == null ? '' : String(v)).trim()
}

// ---------------------------------------------------------------------------
// Steamoji import
// ---------------------------------------------------------------------------

const STEAMOJI_GRAPHQL = 'https://api.steamoji.com/query'

const APPRENTICES_QUERY = `query Apprentices($organizationID: ID, $page: Int, $size: Int, $activeMembership: Boolean, $upgraded: Boolean) {
  apprentices(organizationID: $organizationID, page: $page, size: $size, activeMembership: $activeMembership, upgraded: $upgraded) {
    id
    familyRole
    firstName
    lastName
    email
    phoneNumber
    level
    school
    dateOfBirth
    isUpgraded
    family {
      houseTeam
      members {
        id
        isLead
        firstName
        lastName
        email
        familyRole
        isChild
        phoneNumber
      }
    }
  }
}`

function calcAge(dob) {
  if (!dob) return ''
  const birth = new Date(dob)
  if (isNaN(birth.getTime())) return ''
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
  return String(age)
}

function normalizeFamilyRole(familyRole) {
  if (!familyRole) return ''
  const r = familyRole.toUpperCase()
  if (r === 'PARENT') return 'Parent'
  if (['SON', 'DAUGHTER', 'CHILD'].includes(r)) return 'Child'
  return familyRole
}

function findParentMember(familyMembers) {
  if (!Array.isArray(familyMembers)) return null
  // Priority: explicit PARENT role → isLead → not a child (isChild !== true) with email
  return (
    familyMembers.find((m) => (m.familyRole || '').toUpperCase() === 'PARENT') ||
    familyMembers.find((m) => m.isLead) ||
    familyMembers.find((m) => m.isChild !== true && m.email) ||
    null
  )
}

/**
 * Fetch all active members from the Steamoji GraphQL API and upsert them
 * into the local `members` collection.
 *
 * The caller (admin) must supply their Steamoji `authToken` (the full
 * `identoji AgE...` value copied from the browser's Authorization header)
 * and the `organizationID` for their org.
 *
 * Optional `branchIds` assigns the imported members to specific branches.
 * Optional `onlyUpgraded` restricts the import to upgraded members only.
 */
/** Returns whether Steamoji credentials are configured (env or branch). */
export async function getSteamojiTokenStatus({ branchId } = {}) {
  let tokenConfigured = !!config.steamoji.authToken
  let cookieConfigured = false

  if (branchId) {
    const branch = await Branch.findOne({ id: String(branchId) }).lean()
    if (branch?.steamojiAuthToken?.trim()) tokenConfigured = true
    if (branch?.steamojiAuthCookie?.trim()) cookieConfigured = true
  } else {
    const withToken = await Branch.findOne({
      steamojiAuthToken: { $nin: ['', null] },
    })
      .select('_id')
      .lean()
    const withCookie = await Branch.findOne({
      steamojiAuthCookie: { $nin: ['', null] },
    })
      .select('_id')
      .lean()
    if (withToken) tokenConfigured = true
    if (withCookie) cookieConfigured = true
  }

  return { success: true, tokenConfigured, cookieConfigured }
}

function normalizeSteamojiToken(raw) {
  let t = (raw || '').trim()
  if (t.startsWith('"') && t.endsWith('"')) t = t.slice(1, -1).trim()
  if (t && !t.startsWith('identoji ')) t = `identoji ${t}`
  return t
}

/** Strip accidental `authoji=` prefix when pasted from DevTools. */
function normalizeSteamojiCookie(raw) {
  let c = (raw || '').trim()
  if (c.startsWith('"') && c.endsWith('"')) c = c.slice(1, -1).trim()
  const fromPair = c.match(/(?:^|;\s*)authoji=([^;]+)/i)
  if (fromPair) return fromPair[1].trim()
  if (/^authoji=/i.test(c)) return c.replace(/^authoji=/i, '').trim()
  return c
}

async function resolveSteamojiCredentials({ authToken, organizationID, branchIds }) {
  let resolvedToken = normalizeSteamojiToken(authToken)
  let resolvedCookie = ''
  let cookieBranchId = null

  const explicitIds = normalizeBranchIds(branchIds) || []

  // 1) Branch selected in the import modal (most reliable)
  if (explicitIds.length) {
    const selectedBranch = await Branch.findOne({ id: explicitIds[0] }).lean()
    if (selectedBranch) {
      if (!resolvedToken) resolvedToken = normalizeSteamojiToken(selectedBranch.steamojiAuthToken)
      if (selectedBranch.steamojiAuthCookie) {
        resolvedCookie = normalizeSteamojiCookie(selectedBranch.steamojiAuthCookie)
        cookieBranchId = selectedBranch._id
      }
    }
  }

  // 2) Branch matched by organization ID
  const matchingBranch = await Branch.findOne({ organizationId: organizationID }).lean()
  if (matchingBranch) {
    if (!resolvedToken) resolvedToken = normalizeSteamojiToken(matchingBranch.steamojiAuthToken)
    if (!resolvedCookie && matchingBranch.steamojiAuthCookie) {
      resolvedCookie = normalizeSteamojiCookie(matchingBranch.steamojiAuthCookie)
      cookieBranchId = matchingBranch._id
    }
  }

  // 3) Global env fallback (token only — no cookie in env)
  if (!resolvedToken) resolvedToken = normalizeSteamojiToken(config.steamoji.authToken)

  return { resolvedToken, resolvedCookie, cookieBranchId }
}

export async function importFromSteamoji({
  authToken,
  organizationID,
  branchIds = [],
  onlyUpgraded = false,
} = {}) {
  if (!organizationID) return { success: false, error: 'organizationID is required' }

  let { resolvedToken, resolvedCookie, cookieBranchId } = await resolveSteamojiCredentials({
    authToken,
    organizationID,
    branchIds,
  })

  if (!resolvedToken) {
    return {
      success: false,
      error: 'No Steamoji auth token found. Set the token on the branch (Branches → Edit) or paste it in the import modal.',
    }
  }
  if (!resolvedCookie) {
    return {
      success: false,
      error: 'No Steamoji session cookie (authoji) found. Set it on the branch (Branches → Edit → Steamoji Auth Cookie).',
    }
  }

  const PAGE_SIZE = 100
  let page = 0
  const allApprentices = []

  while (true) {
    const variables = {
      organizationID,
      page,
      size: PAGE_SIZE,
      activeMembership: true,
    }
    if (onlyUpgraded) variables.upgraded = true

    const res = await fetch(STEAMOJI_GRAPHQL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: '*/*',
        Authorization: resolvedToken,
        Cookie: `authoji=${resolvedCookie}`,
        Origin: 'https://dashboard.steamoji.com',
        Referer: 'https://dashboard.steamoji.com/',
      },
      body: JSON.stringify({
        operationName: 'Apprentices',
        query: APPRENTICES_QUERY,
        variables,
      }),
    })

    // Auto-refresh the authoji cookie from the Set-Cookie response header
    // so it keeps sliding forward and never expires between imports.
    const setCookie = res.headers.get('set-cookie') || ''
    const cookieMatch = setCookie.match(/authoji=([^;]+)/)
    if (cookieMatch) {
      resolvedCookie = cookieMatch[1]
      if (cookieBranchId) {
        // Fire-and-forget — don't block the import on this
        Branch.updateOne({ _id: cookieBranchId }, { steamojiAuthCookie: resolvedCookie })
          .catch((e) => console.warn('[steamoji] failed to refresh cookie:', e.message))
      }
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Steamoji API returned ${res.status}: ${body.slice(0, 200)}`)
    }

    const rawText = await res.text().catch(() => '')
    let json = null
    try {
      json = JSON.parse(rawText)
    } catch {
      console.error('[steamoji] non-JSON response body:', rawText.slice(0, 500))
      throw new Error(
        `Steamoji API returned non-JSON (status ${res.status}). ` +
        `Body: ${rawText.slice(0, 200) || '(empty)'}`
      )
    }
    if (!json) {
      throw new Error(`Steamoji API returned null (status ${res.status}). Token or cookie may be invalid.`)
    }
    if (json.errors && json.errors.length) {
      throw new Error(`Steamoji GraphQL error: ${json.errors[0].message}`)
    }

    const batch = json?.data?.apprentices || []
    allApprentices.push(...batch)
    if (batch.length < PAGE_SIZE) break
    page++
  }

  // Auto-match branches by organizationId so the admin doesn't have to map
  // manually. Any explicitly-passed branchIds are merged on top.
  const matchedBranches = await Branch.find({
    organizationId: organizationID,
    active: { $ne: false },
  })
    .select('id')
    .lean()
  const matchedIds = matchedBranches.map((b) => b.id).filter(Boolean)

  const explicitIds = normalizeBranchIds(branchIds) || []
  const mergedBranchIds = [...new Set([...matchedIds, ...explicitIds])]

  let imported = 0
  let updated = 0
  let skipped = 0
  let lapsed = 0
  let autoResolved = 0
  const errors = []

  // Track every member _id we touch so we can detect who dropped off.
  const touchedIds = new Set()

  // Identities successfully upserted into `members` — used at the end to
  // auto-delete any matching PendingMember rows (duplicate approval requests).
  const resolvedIdentities = []

  for (const apprentice of allApprentices) {
    try {
      const familyMembers = apprentice.family?.members || []
      const houseTeam = apprentice.family?.houseTeam || ''
      const role = (apprentice.familyRole || '').toUpperCase()

      let parentEmail = ''
      let parentName = ''
      let phoneNumber = str(apprentice.phoneNumber)

      if (role === 'PARENT') {
        parentEmail = str(apprentice.email).toLowerCase()
      } else {
        const parentMember = findParentMember(familyMembers)
        if (parentMember) {
          parentEmail = str(parentMember.email).toLowerCase()
          parentName =
            `${str(parentMember.firstName)} ${str(parentMember.lastName)}`.trim()
          if (!phoneNumber && parentMember.phoneNumber) {
            phoneNumber = str(parentMember.phoneNumber)
          }
        } else {
          parentEmail = str(apprentice.email).toLowerCase()
        }

        // Tier 4: parent was found (name/phone resolved) but has no email —
        // borrow the email from any other adult family member who has one.
        if (!parentEmail) {
          const emailDonor = familyMembers.find(
            (m) => m.isChild !== true && m.email && m.id !== parentMember?.id
          )
          if (emailDonor) parentEmail = str(emailDonor.email).toLowerCase()
        }
      }

      if (!parentEmail || !apprentice.firstName || !apprentice.lastName) {
        skipped++
        console.log('[steamoji:skip] ---- SKIPPED MEMBER ----')
        console.log('[steamoji:skip] name      :', apprentice.firstName, apprentice.lastName)
        console.log('[steamoji:skip] role      :', apprentice.familyRole)
        console.log('[steamoji:skip] email     :', apprentice.email)
        console.log('[steamoji:skip] parentEmail resolved:', parentEmail)
        console.log('[steamoji:skip] parentName resolved :', parentName)
        console.log('[steamoji:skip] family.members:', JSON.stringify(familyMembers, null, 2))
        // Store as a conflict so admins can review and fix in Approvals tab
        const reason = (!apprentice.firstName || !apprentice.lastName)
          ? 'Missing name'
          : 'Missing parent email'
        await ImportConflict.findOneAndUpdate(
          {
            // Match on identity only — no status filter so resolved/dismissed
            // records are found and NOT recreated as new pending conflicts.
            firstName: str(apprentice.firstName),
            lastName: str(apprentice.lastName),
            organizationID,
          },
          {
            // Always refresh the data fields in case Steamoji info changed.
            $set: {
              source: 'steamoji',
              reason,
              organizationID,
              firstName: str(apprentice.firstName),
              lastName: str(apprentice.lastName),
              familyRole: normalizeFamilyRole(apprentice.familyRole),
              age: calcAge(apprentice.dateOfBirth),
              house: str(houseTeam),
              level: str(apprentice.level),
              school: str(apprentice.school),
              parent: parentName,
              parentEmail,
              phoneNumber,
              membershipType: apprentice.isUpgraded ? 'yearly' : 'none',
              branchIds: mergedBranchIds,
            },
            // Only set status to 'pending' when creating a brand-new document.
            // Existing resolved/dismissed records keep their status.
            $setOnInsert: { status: 'pending' },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        ).catch((e) => console.warn('[steamoji] failed to save conflict:', e.message))
        continue
      }

      const payload = {
        firstName: str(apprentice.firstName),
        lastName: str(apprentice.lastName),
        familyRole: normalizeFamilyRole(apprentice.familyRole),
        age: calcAge(apprentice.dateOfBirth),
        house: str(houseTeam),
        level: str(apprentice.level),
        school: str(apprentice.school),
        parent: parentName,
        parentEmail,
        phoneNumber,
        membershipType: apprentice.isUpgraded ? 'yearly' : 'none',
        // Always replace branchIds when branches are known so transfers between
        // orgs/branches are reflected on the next import.
        ...(mergedBranchIds.length ? { branchIds: mergedBranchIds } : {}),
      }

      const identity = {
        firstName: payload.firstName,
        lastName: payload.lastName,
        parentEmail: payload.parentEmail,
      }

      const existing = await Member.findOne(identity)
      if (existing) {
        const importPayload = { ...payload }
        // Admin manually locked this membership — preserve their setting.
        if (existing.membershipOverride) delete importPayload.membershipType
        Object.assign(existing, importPayload)
        // Explicitly mark branchIds modified so Mongoose persists the array
        // replacement even when the reference didn't change.
        if (mergedBranchIds.length) existing.markModified('branchIds')
        await existing.save()
        updated++
        touchedIds.add(String(existing._id))
      } else {
        const created = await Member.create({
          ...payload,
          approvedAt: new Date(),
          approvedBy: 'steamoji-import',
        })
        imported++
        touchedIds.add(String(created._id))
      }

      // Record this identity so we can sweep duplicate pending approvals below.
      resolvedIdentities.push(identity)
    } catch (err) {
      errors.push(
        `${apprentice.firstName || ''} ${apprentice.lastName || ''}: ${err.message}`
      )
    }
  }

  // ── Auto-resolve duplicate pending approval requests ──────────────────────
  // Any PendingMember whose firstName + lastName + parentEmail matches a member
  // we just imported is a stale duplicate — Steamoji already confirmed them, so
  // the admin doesn't need to manually approve the same person again.
  if (resolvedIdentities.length > 0) {
    try {
      const orClauses = resolvedIdentities.map(({ firstName, lastName, parentEmail }) => ({
        firstName: new RegExp(`^${escapeImportRe(firstName)}$`, 'i'),
        lastName:  new RegExp(`^${escapeImportRe(lastName)}$`,  'i'),
        parentEmail,
      }))
      const deleteResult = await PendingMember.deleteMany({ $or: orClauses })
      autoResolved = deleteResult.deletedCount
      if (autoResolved > 0) {
        console.log(
          `[steamoji] Auto-removed ${autoResolved} duplicate pending approval request(s) ` +
          `that matched imported members.`
        )
      }
    } catch (err) {
      console.warn('[steamoji] Failed to auto-resolve pending members:', err.message)
    }
  }

  // Downgrade any Steamoji-imported member in the same branch(es) who was NOT
  // in the active list — their membership has lapsed, so they pay full price.
  if (mergedBranchIds.length && touchedIds.size > 0) {
    const touchedOids = [...touchedIds].map((id) => new mongoose.Types.ObjectId(id))
    const lapsedResult = await Member.updateMany(
      {
        _id: { $nin: touchedOids },
        approvedBy: 'steamoji-import',
        branchIds: { $in: mergedBranchIds },
        membershipType: { $ne: 'none' },
        membershipOverride: { $ne: true }, // never touch manually-locked members
      },
      { $set: { membershipType: 'none' } }
    )
    lapsed = lapsedResult.modifiedCount
  }

  return {
    success: true,
    total: allApprentices.length,
    imported,
    updated,
    lapsed,
    skipped,
    autoResolved,
    assignedBranchIds: mergedBranchIds,
    errors: errors.slice(0, 20),
  }
}

function escapeImportRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ---------------------------------------------------------------------------
// Import Conflict handlers
// ---------------------------------------------------------------------------

export async function getImportConflicts() {
  const conflicts = await ImportConflict.find({ status: 'pending' })
    .sort('-createdAt')
    .lean()
  return { success: true, conflicts }
}

export async function resolveImportConflict(id, data) {
  const conflict = await ImportConflict.findById(id)
  if (!conflict) return { success: false, error: 'Conflict not found' }

  const firstName = str(data.firstName) || conflict.firstName
  const lastName = str(data.lastName) || conflict.lastName
  const parentEmail = str(data.parentEmail).toLowerCase() || conflict.parentEmail

  if (!firstName || !lastName || !parentEmail) {
    return { success: false, error: 'firstName, lastName, and parentEmail are required' }
  }

  const member = await Member.create({
    firstName,
    lastName,
    familyRole: str(data.familyRole) || conflict.familyRole,
    age: str(data.age) || conflict.age,
    house: str(data.house) || conflict.house,
    level: str(data.level) || conflict.level,
    school: str(data.school) || conflict.school,
    parent: str(data.parent) || conflict.parent,
    parentEmail,
    phoneNumber: str(data.phoneNumber) || conflict.phoneNumber,
    membershipType: str(data.membershipType) || conflict.membershipType || 'none',
    branchIds: data.branchIds?.length ? data.branchIds : conflict.branchIds,
    approvedBy: 'import-conflict-resolved',
    approvedAt: new Date(),
  })

  conflict.status = 'resolved'
  await conflict.save()

  return { success: true, member: member.toClientJSON() }
}

export async function dismissImportConflict(id) {
  const conflict = await ImportConflict.findById(id)
  if (!conflict) return { success: false, error: 'Conflict not found' }
  conflict.status = 'dismissed'
  await conflict.save()
  return { success: true }
}
