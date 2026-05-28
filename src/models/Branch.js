import mongoose from 'mongoose'

/**
 * Branch = a physical location ("Downtown", "Westside", ...).
 *
 * Each Member belongs to one or more branches (member.branchIds), each
 * Session is owned by exactly one branch (session.branchId), and a member
 * is allowed to register for a session if:
 *
 *    session.branchId ∈ member.branchIds
 *   OR
 *    session.branchId is linked to any branch in member.branchIds
 *
 * Linkage is stored on both sides (bidirectional). Admin actions in
 * `linkBranches` / `unlinkBranches` keep the two sides in sync.
 *
 * `id` is a short human-friendly string (`B<nano>`), same convention used
 * for Session.id. Registrations / members / sessions all reference a
 * branch by this `id`, never by ObjectId.
 */
const BranchSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true, index: true },
    code: { type: String, trim: true, default: '' },

    // External system identifier. Used to match this branch to the
    // corresponding organisation in the other platform (e.g. CRM / portal).
    organizationId: { type: String, trim: true, default: '', index: true },

    // Steamoji auth token for this branch's organisation. Stored here so
    // each org can have its own token without needing a global env var.
    steamojiAuthToken: { type: String, trim: true, default: '' },

    // Steamoji org-level session cookie (`authoji` value). Required alongside
    // the auth token. Auto-refreshed after every successful import.
    steamojiAuthCookie: { type: String, trim: true, default: '' },

    address: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    region: { type: String, trim: true, default: '' },
    country: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },

    // Gmail App Password for this branch's email address (branch.email).
    // When set, all outgoing emails for this branch are sent from branch.email
    // using this app password. Generate one at:
    // Google Account → Security → 2-Step Verification → App passwords.
    gmailAppPass: { type: String, trim: true, default: '' },

    // Per-branch Square payment credentials.
    // squareEnv: 'sandbox' | 'production'
    squareEnv: { type: String, trim: true, default: 'sandbox' },
    squareAccessToken: { type: String, trim: true, default: '' },
    squareLocationId: { type: String, trim: true, default: '' },
    squareApplicationId: { type: String, trim: true, default: '' },

    // Branch ids this branch shares workshops + members with. Always kept
    // symmetric by the handler (if A.linkedBranchIds includes B, then
    // B.linkedBranchIds includes A).
    linkedBranchIds: { type: [String], default: [] },

    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
)

BranchSchema.method('toClientJSON', function () {
  const b = this.toObject()
  return serializeBranch(b)
})

export function serializeBranchPublic(b) {
  if (!b) return null
  return {
    id: b.id,
    name: b.name || '',
    code: b.code || '',
    address: b.address || '',
    city: b.city || '',
    region: b.region || '',
    country: b.country || '',
    phone: b.phone || '',
    email: b.email || '',
    linkedBranchIds: Array.isArray(b.linkedBranchIds)
      ? b.linkedBranchIds.filter(Boolean)
      : [],
    active: b.active !== false,
  }
}

/** Full branch record — admin only (API keys, tokens, passwords). */
export function serializeBranch(b, { admin = false } = {}) {
  if (!b) return null
  if (!admin) return serializeBranchPublic(b)
  return {
    ...serializeBranchPublic(b),
    organizationId: b.organizationId || '',
    steamojiAuthToken: b.steamojiAuthToken || '',
    steamojiAuthCookie: b.steamojiAuthCookie || '',
    gmailAppPass: b.gmailAppPass || '',
    squareEnv: b.squareEnv || 'sandbox',
    squareAccessToken: b.squareAccessToken || '',
    squareLocationId: b.squareLocationId || '',
    squareApplicationId: b.squareApplicationId || '',
    createdAt: b.createdAt || null,
    updatedAt: b.updatedAt || null,
  }
}

export default mongoose.models.Branch || mongoose.model('Branch', BranchSchema)
