import { schedule } from 'node-cron'
import Branch from '../models/Branch.js'
import Registration from '../models/Registration.js'
import Session from '../models/Session.js'
import Member from '../models/Member.js'
import { importFromSteamoji } from '../handlers/members.js'
import { sendSessionReminderEmail } from './email.js'

/**
 * Runs at midnight every day.
 * Finds every branch that has both a Steamoji auth token and cookie set,
 * groups them by organizationId, and runs one import per org.
 */
async function runSteamojiImport() {
  console.log('[cron] Starting nightly Steamoji import…')

  let branches
  try {
    branches = await Branch.find({
      steamojiAuthToken: { $nin: ['', null] },
      steamojiAuthCookie: { $nin: ['', null] },
      organizationId: { $nin: ['', null] },
      active: { $ne: false },
    }).lean()
  } catch (err) {
    console.error('[cron] Failed to load branches:', err.message)
    return
  }

  if (!branches.length) {
    console.log('[cron] No branches with Steamoji credentials configured — skipping.')
    return
  }

  // Deduplicate by organizationId (multiple branches can share one org)
  const seenOrgs = new Set()
  const orgs = []
  for (const b of branches) {
    if (!seenOrgs.has(b.organizationId)) {
      seenOrgs.add(b.organizationId)
      orgs.push({ organizationId: b.organizationId, branchId: b._id })
    }
  }

  let totalImported = 0
  let totalUpdated = 0
  let totalLapsed = 0
  let totalSkipped = 0
  let totalAutoResolved = 0

  for (const { organizationId } of orgs) {
    try {
      const result = await importFromSteamoji({ organizationID: organizationId })
      if (result.success) {
        console.log(
          `[cron] org ${organizationId} — ` +
          `new: ${result.imported}, updated: ${result.updated}, ` +
          `lapsed: ${result.lapsed ?? 0}, skipped: ${result.skipped}, ` +
          `auto-resolved pending: ${result.autoResolved ?? 0}`
        )
        totalImported += result.imported || 0
        totalUpdated += result.updated || 0
        totalLapsed += result.lapsed || 0
        totalSkipped += result.skipped || 0
        totalAutoResolved += result.autoResolved || 0
      } else {
        console.warn(`[cron] org ${organizationId} failed: ${result.error}`)
      }
    } catch (err) {
      console.error(`[cron] org ${organizationId} threw: ${err.message}`)
    }
  }

  console.log(
    `[cron] Nightly import done — ` +
    `new: ${totalImported}, updated: ${totalUpdated}, ` +
    `lapsed: ${totalLapsed}, skipped: ${totalSkipped}, ` +
    `auto-resolved pending: ${totalAutoResolved}`
  )
}

/**
 * Runs at 10:00 AM every day.
 * Finds every session happening tomorrow, then for each registered member
 * sends a reminder email to the parent.
 */
async function runDayBeforeReminders() {
  console.log('[cron] Starting day-before session reminders…')

  // Build a window that covers all of "tomorrow" in Vancouver time
  const now = new Date()
  // Tomorrow midnight in UTC, adjusted for America/Vancouver (UTC-7 / UTC-8)
  // We use a ±1 day window around tomorrow to be timezone-safe
  const tomorrowStart = new Date(now)
  tomorrowStart.setDate(tomorrowStart.getDate() + 1)
  tomorrowStart.setHours(0, 0, 0, 0)

  const tomorrowEnd = new Date(tomorrowStart)
  tomorrowEnd.setHours(23, 59, 59, 999)

  let sessions
  try {
    sessions = await Session.find({
      dt: { $gte: tomorrowStart, $lte: tomorrowEnd },
      reg: { $exists: true, $not: { $size: 0 } },
    }).lean()
  } catch (err) {
    console.error('[cron] Failed to load tomorrow\'s sessions:', err.message)
    return
  }

  if (!sessions.length) {
    console.log('[cron] No sessions tomorrow — skipping reminders.')
    return
  }

  console.log(`[cron] Found ${sessions.length} session(s) tomorrow. Sending reminders…`)

  // Cache branches to avoid repeated DB calls for the same branchId
  const branchCache = new Map()
  async function getBranch(branchId) {
    if (!branchId) return null
    if (branchCache.has(branchId)) return branchCache.get(branchId)
    const b = await Branch.findOne({ id: branchId }).lean()
    branchCache.set(branchId, b)
    return b
  }

  let sent = 0
  let skipped = 0

  for (const session of sessions) {
    const registrationIds = Array.isArray(session.reg) ? session.reg : []
    if (!registrationIds.length) continue

    const branch = await getBranch(session.branchId)

    // Load all registrations for this session in one query
    const registrations = await Registration.find({
      sessionId: session.id,
      id: { $in: registrationIds },
    }).lean()

    // Collect unique memberIds
    const memberIds = [...new Set(registrations.map((r) => r.memberId).filter(Boolean))]
    const members = await Member.find({ _id: { $in: memberIds } }).lean()
    const memberMap = new Map(members.map((m) => [String(m._id), m]))

    for (const reg of registrations) {
      const member = memberMap.get(String(reg.memberId))
      if (!member?.parentEmail) { skipped++; continue }

      try {
        await sendSessionReminderEmail(member, session, branch)
        sent++
      } catch (err) {
        console.error(`[cron] Reminder failed for ${member.parentEmail}:`, err.message)
        skipped++
      }
    }
  }

  console.log(`[cron] Reminder run done — sent: ${sent}, skipped/no-email: ${skipped}`)
}

export function startCronJobs() {
  // Midnight: nightly Steamoji member import
  schedule('0 0 * * *', () => {
    runSteamojiImport().catch((err) =>
      console.error('[cron] Unhandled error in runSteamojiImport:', err)
    )
  }, { timezone: 'America/Vancouver' })

  // 10 AM: day-before session reminders
  schedule('0 10 * * *', () => {
    runDayBeforeReminders().catch((err) =>
      console.error('[cron] Unhandled error in runDayBeforeReminders:', err)
    )
  }, { timezone: 'America/Vancouver' })

  console.log('[cron] Jobs scheduled (America/Vancouver):')
  console.log('[cron]   00:00 — Steamoji member import')
  console.log('[cron]   10:00 — Day-before session reminders')
}
