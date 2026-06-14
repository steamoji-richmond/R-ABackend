import express from 'express'
import * as members from '../handlers/members.js'
import * as sessions from '../handlers/sessions.js'
import * as regs from '../handlers/registrations.js'
import * as pay from '../handlers/payments.js'
import * as branches from '../handlers/branches.js'

const router = express.Router()

// Branches
router.get('/branches', async (req, res, next) => {
  try {
    const activeOnly = req.query.activeOnly === '1' || req.query.activeOnly === 'true'
    res.json(await branches.getAllBranches({ activeOnly }))
  } catch (e) {
    next(e)
  }
})
router.get('/branches/:id', async (req, res, next) => {
  try {
    res.json(await branches.getBranch(req.params.id))
  } catch (e) {
    next(e)
  }
})
router.post('/branches', async (req, res, next) => {
  try {
    res.json(await branches.saveBranch(req.body))
  } catch (e) {
    next(e)
  }
})
router.delete('/branches/:id', async (req, res, next) => {
  try {
    const force = req.query.force === '1' || req.query.force === 'true'
    res.json(await branches.deleteBranch(req.params.id, { force }))
  } catch (e) {
    next(e)
  }
})
router.post('/branches/:id/active', async (req, res, next) => {
  try {
    const { active } = req.body || {}
    res.json(await branches.setBranchActive(req.params.id, !!active))
  } catch (e) {
    next(e)
  }
})
router.post('/branches/:id/links', async (req, res, next) => {
  try {
    const body = req.body || {}
    const ids = Array.isArray(body.linkedBranchIds) ? body.linkedBranchIds : []
    const action = ['add', 'remove', 'set'].includes(body.action) ? body.action : 'add'
    res.json(await branches.linkBranches(req.params.id, ids, action))
  } catch (e) {
    next(e)
  }
})

// Members
router.get('/members', async (_, res, next) => {
  try {
    res.json(await members.getAllValidation())
  } catch (e) {
    next(e)
  }
})
router.get('/members/lookup', async (req, res, next) => {
  try {
    res.json(await members.lookupByEmail(req.query.email))
  } catch (e) {
    next(e)
  }
})
router.post('/members', async (req, res, next) => {
  try {
    res.json(await members.upsertValidation(req.body))
  } catch (e) {
    next(e)
  }
})
router.get('/members/steamoji-token-status', async (req, res, next) => {
  try {
    res.json(await members.getSteamojiTokenStatus({ branchId: req.query.branchId }))
  } catch (e) {
    next(e)
  }
})
router.post('/members/import-steamoji', async (req, res, next) => {
  try {
    res.json(await members.importFromSteamoji(req.body || {}))
  } catch (e) {
    next(e)
  }
})
router.get('/members/import-conflicts', async (_req, res, next) => {
  try {
    res.json(await members.getImportConflicts())
  } catch (e) {
    next(e)
  }
})
router.post('/members/import-conflicts/:id/resolve', async (req, res, next) => {
  try {
    res.json(await members.resolveImportConflict(req.params.id, req.body || {}))
  } catch (e) {
    next(e)
  }
})
router.post('/members/import-conflicts/:id/dismiss', async (req, res, next) => {
  try {
    res.json(await members.dismissImportConflict(req.params.id))
  } catch (e) {
    next(e)
  }
})
router.delete('/members/:id', async (req, res, next) => {
  try {
    res.json(await members.deleteValidation(req.params.id))
  } catch (e) {
    next(e)
  }
})
router.get('/members/pending', async (_, res, next) => {
  try {
    res.json(await members.getPendingMembers())
  } catch (e) {
    next(e)
  }
})
router.post('/members/:id/approve', async (req, res, next) => {
  try {
    res.json(
      await members.approveMember(req.params.id, (req.body || {}).approvedBy || '')
    )
  } catch (e) {
    next(e)
  }
})
router.post('/members/:id/reject', async (req, res, next) => {
  try {
    const body = req.body || {}
    res.json(
      await members.rejectMember(req.params.id, body.reason || '', body.approvedBy || '')
    )
  } catch (e) {
    next(e)
  }
})

// Sessions
router.get('/sessions', async (req, res, next) => {
  try {
    const raw = req.query.branchIds || req.query.branchId
    const branchIds = raw
      ? String(raw)
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean)
      : undefined
    res.json(await sessions.getAllSessions({ branchIds }))
  } catch (e) {
    next(e)
  }
})
router.post('/sessions', async (req, res, next) => {
  try {
    res.json(await sessions.saveSession(req.body))
  } catch (e) {
    next(e)
  }
})
router.delete('/sessions/:id', async (req, res, next) => {
  try {
    const reason = req.body?.reason || req.query.reason || ''
    res.json(await sessions.deleteSession(req.params.id, reason))
  } catch (e) {
    next(e)
  }
})

// Registrations
router.get('/registrations', async (_, res, next) => {
  try {
    res.json(await regs.getAllRegistrations())
  } catch (e) {
    next(e)
  }
})
router.post('/registrations', async (req, res, next) => {
  try {
    res.json(await regs.saveRegistration(req.body))
  } catch (e) {
    next(e)
  }
})
router.patch('/registrations/:id', async (req, res, next) => {
  try {
    res.json(await regs.updateRegistration({ id: req.params.id, ...req.body }))
  } catch (e) {
    next(e)
  }
})
router.delete('/registrations/:id', async (req, res, next) => {
  try {
    res.json(await regs.deleteRegistration(req.params.id))
  } catch (e) {
    next(e)
  }
})

// Payments
router.post('/payments/:registrationId/checkout', async (req, res, next) => {
  try {
    res.json(await pay.createPaymentLink(req.params.registrationId))
  } catch (e) {
    next(e)
  }
})
router.get('/payments/:registrationId/status', async (req, res, next) => {
  try {
    res.json(await pay.confirmPayment(req.params.registrationId))
  } catch (e) {
    next(e)
  }
})

export default router
