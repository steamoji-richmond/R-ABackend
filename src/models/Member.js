import mongoose from 'mongoose'

/**
 * Member is the canonical list of **approved** people that can register for
 * sessions, receive badges, and show up in reports.
 *
 * New sign-ups do NOT land here directly — they go into `pendingmembers`
 * first and are only copied into this collection after an admin approves
 * them. See `models/PendingMember.js` for the queue side of the workflow.
 */
const MemberSchema = new mongoose.Schema(
  {
    badgeId: { type: String, trim: true, index: true, sparse: true },
    firstName: { type: String, trim: true, default: '' },
    lastName: { type: String, trim: true, default: '' },
    familyRole: { type: String, trim: true, default: '' },
    age: { type: String, trim: true, default: '' },
    house: { type: String, trim: true, default: '' },
    level: { type: String, trim: true, default: '' },
    school: { type: String, trim: true, default: '' },
    parent: { type: String, trim: true, default: '' },
    parentEmail: {
      type: String,
      trim: true,
      lowercase: true,
      index: true,
      default: '',
    },
    phoneNumber: { type: String, trim: true, default: '', index: true },
    membershipType: {
      type: String,
      enum: ['yearly', 'semi-yearly', 'none'],
      default: 'none',
      index: true,
    },

    // Branches this member belongs to. A member can belong to more than one
    // (e.g. a family that attends two branches). When registering for a
    // session the server also expands each of these through
    // `Branch.linkedBranchIds`, so members effectively see sessions from
    // their own branches plus any that admins have linked together.
    branchIds: { type: [String], default: [], index: true },

    // When true the import will never overwrite membershipType — an admin has
    // manually set a custom discount and wants it preserved across syncs.
    membershipOverride: { type: Boolean, default: false },

    approvedAt: { type: Date, default: null },
    approvedBy: { type: String, default: '' },
  },
  {
    timestamps: true,
    collation: { locale: 'en', strength: 2 },
  }
)

MemberSchema.index(
  { parentEmail: 1, firstName: 1, lastName: 1 },
  { name: 'parent_fullname_idx' }
)

MemberSchema.method('toClientJSON', function () {
  const m = this.toObject({ virtuals: false })
  return {
    _id: String(m._id),
    _rowIndex: String(m._id),
    badgeId: m.badgeId || '',
    firstName: m.firstName || '',
    lastName: m.lastName || '',
    familyRole: m.familyRole || '',
    age: m.age || '',
    house: m.house || '',
    level: m.level || '',
    school: m.school || '',
    parent: m.parent || '',
    parentEmail: m.parentEmail || '',
    phoneNumber: m.phoneNumber || '',
    membershipType: m.membershipType || 'none',
    membershipOverride: m.membershipOverride || false,
    branchIds: Array.isArray(m.branchIds) ? m.branchIds.filter(Boolean) : [],
    approvalStatus: 'approved',
    approvedAt: m.approvedAt || null,
    approvedBy: m.approvedBy || '',
    rejectedReason: '',
  }
})

export default mongoose.models.Member || mongoose.model('Member', MemberSchema)
