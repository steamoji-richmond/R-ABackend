import mongoose from 'mongoose'

/**
 * PendingMember is a separate collection that holds sign-ups which are waiting
 * for admin review. Records live here only while the account is pending or has
 * been rejected — the moment an admin approves the sign-up, a row is copied
 * into the `members` collection and removed from here.
 *
 * Keeping these two collections separate means the main `members` collection
 * is always a clean list of real, approved members. Pending / rejected rows
 * never pollute lookups, registrations, or reports.
 *
 * Rejected sign-ups stay here with `status = 'rejected'` so that if the user
 * logs in again we can still show them the "not approved" banner and the
 * reason, without having to track that state on the real members collection.
 */
const PendingMemberSchema = new mongoose.Schema(
  {
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
    },

    // Branches the user selected when signing up. Carried over verbatim into
    // the approved Member row when the admin approves the sign-up.
    branchIds: { type: [String], default: [], index: true },

    // Lifecycle on this collection:
    //   'pending'  – waiting for an admin to approve/reject
    //   'rejected' – admin rejected; kept so the user can see the reason
    // Once approved the row is deleted from here and inserted into `members`.
    status: {
      type: String,
      enum: ['pending', 'rejected'],
      default: 'pending',
      index: true,
    },
    submittedBy: { type: String, default: '' },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: String, default: '' },
    rejectedReason: { type: String, default: '' },
  },
  {
    timestamps: true,
    collation: { locale: 'en', strength: 2 },
  }
)

PendingMemberSchema.index(
  { parentEmail: 1, firstName: 1, lastName: 1 },
  { name: 'pending_parent_fullname_idx' }
)

export default mongoose.models.PendingMember ||
  mongoose.model('PendingMember', PendingMemberSchema)
