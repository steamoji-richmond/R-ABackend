import mongoose from 'mongoose'

/**
 * ImportConflict holds Steamoji records that couldn't be imported automatically
 * because required fields (parentEmail, firstName, lastName) were missing.
 * Admins review these in the Approvals → Import Conflicts tab, fill in any
 * missing info, and save them as real members.
 */
const ImportConflictSchema = new mongoose.Schema(
  {
    source: { type: String, default: 'steamoji' },
    reason: { type: String, trim: true, default: '' },
    organizationID: { type: String, trim: true, default: '', index: true },

    // Pre-filled from Steamoji — may be partial
    firstName: { type: String, trim: true, default: '' },
    lastName: { type: String, trim: true, default: '' },
    familyRole: { type: String, trim: true, default: '' },
    age: { type: String, trim: true, default: '' },
    house: { type: String, trim: true, default: '' },
    level: { type: String, trim: true, default: '' },
    school: { type: String, trim: true, default: '' },
    parent: { type: String, trim: true, default: '' },
    parentEmail: { type: String, trim: true, lowercase: true, default: '' },
    phoneNumber: { type: String, trim: true, default: '' },
    membershipType: { type: String, trim: true, default: 'none' },
    branchIds: { type: [String], default: [] },

    status: {
      type: String,
      enum: ['pending', 'resolved', 'dismissed'],
      default: 'pending',
      index: true,
    },
  },
  { timestamps: true }
)

const ImportConflict = mongoose.model('ImportConflict', ImportConflictSchema)
export default ImportConflict
