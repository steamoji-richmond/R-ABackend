import express from 'express'
import * as members from '../handlers/members.js'
import * as sessions from '../handlers/sessions.js'
import * as regs from '../handlers/registrations.js'
import * as pay from '../handlers/payments.js'
import * as branches from '../handlers/branches.js'

const router = express.Router()

/**
 * GAS-compatible endpoint: /exec?action=...
 * Accepts GET and POST. POST body may be JSON or text/plain JSON (the
 * frontend sends text/plain to avoid CORS preflight, just like GAS).
 */
async function handle(req, res) {
  try {
    let body = {}
    if (req.method === 'POST' && req.rawBody) {
      try {
        body = req.rawBody ? JSON.parse(req.rawBody.toString('utf8')) : {}
      } catch {
        body = req.body || {}
      }
    } else {
      body = req.body || {}
    }

    const action = String(req.query.action || body.action || '').trim()
    if (!action) {
      return res.json({
        success: false,
        error:
          "Missing action. Use ?action=saveSession, register, deleteSession, lookup, getSessions, getRegistrations, getValidation, etc.",
      })
    }

    let result
    switch (action) {
      case 'lookup':
        result = await members.lookupByEmail(req.query.email || body.email)
        break
      case 'getValidation':
        result = await members.getAllValidation()
        break
      case 'updateValidation':
        result = await members.upsertValidation(body)
        break
      case 'deleteValidation':
        result = await members.deleteValidation(
          body.rowIndex || req.query.rowIndex
        )
        break
      case 'getPendingMembers':
        result = await members.getPendingMembers()
        break
      case 'approveMember':
        result = await members.approveMember(
          body.memberId || req.query.memberId,
          body.approvedBy || req.query.approvedBy || ''
        )
        break
      case 'rejectMember':
        result = await members.rejectMember(
          body.memberId || req.query.memberId,
          body.reason || req.query.reason || '',
          body.approvedBy || req.query.approvedBy || ''
        )
        break
      case 'steamojiTokenStatus':
        result = members.getSteamojiTokenStatus()
        break
      case 'importSteamoji':
        result = await members.importFromSteamoji(body)
        break
      case 'getImportConflicts':
        result = await members.getImportConflicts()
        break
      case 'resolveImportConflict':
        result = await members.resolveImportConflict(
          body.id || req.query.id,
          body
        )
        break
      case 'dismissImportConflict':
        result = await members.dismissImportConflict(body.id || req.query.id)
        break

      case 'getSessions': {
        const raw = body.branchIds || req.query.branchIds || body.branchId || req.query.branchId
        const branchIds = raw
          ? (Array.isArray(raw) ? raw : String(raw).split(','))
              .map((x) => String(x || '').trim())
              .filter(Boolean)
          : undefined
        result = await sessions.getAllSessions({ branchIds })
        break
      }
      case 'saveSession':
        result = await sessions.saveSession(body)
        break
      case 'saveAllSessions':
        result = await sessions.saveAllSessions(body.sessions || [])
        break
      case 'deleteSession':
        result = await sessions.deleteSession(
          body.sessionId || req.query.sessionId,
          body.reason || req.query.reason || ''
        )
        break

      case 'getRegistrations':
        result = await regs.getAllRegistrations()
        break
      case 'register':
        result = await regs.saveRegistration(body)
        break
      case 'updateRegistration':
        result = await regs.updateRegistration(body)
        break
      case 'updateAllRegistrationsForUser':
        result = await regs.updateAllRegistrationsForUser(body)
        break
      case 'deleteRegistration':
        result = await regs.deleteRegistration(
          body.registrationId || req.query.registrationId
        )
        break
      case 'recordAttendance':
        result = await regs.recordAttendance(body)
        break

      case 'getBranches':
        result = await branches.getAllBranches({
          activeOnly:
            body.activeOnly === true ||
            body.activeOnly === 'true' ||
            req.query.activeOnly === '1' ||
            req.query.activeOnly === 'true',
        })
        break
      case 'saveBranch':
        result = await branches.saveBranch(body)
        break
      case 'deleteBranch':
        result = await branches.deleteBranch(
          body.id || req.query.id,
          { force: !!(body.force || req.query.force) }
        )
        break
      case 'setBranchActive':
        result = await branches.setBranchActive(
          body.id || req.query.id,
          !!body.active
        )
        break
      case 'linkBranches':
        result = await branches.linkBranches(
          body.id || req.query.id,
          Array.isArray(body.linkedBranchIds) ? body.linkedBranchIds : [],
          ['add', 'remove', 'set'].includes(body.action) ? body.action : 'add'
        )
        break

      case 'createPaymentLink':
        result = await pay.createPaymentLink(
          body.registrationId || req.query.registrationId
        )
        break
      case 'confirmPayment':
        result = await pay.confirmPayment(
          body.registrationId || req.query.registrationId
        )
        break

      default:
        result = { success: false, error: `Invalid action: '${action}'` }
    }
    res.json(result)
  } catch (err) {
    console.error('[exec] error', err)
    res.status(500).json({ success: false, error: err.message || String(err) })
  }
}

router.get('/', handle)
router.post('/', handle)

export default router
