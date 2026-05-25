import mongoose from 'mongoose'

const AttendanceSchema = new mongoose.Schema(
  {
    badge: { type: String, trim: true, required: true },
    seat: { type: String, default: '' },
    ts: { type: Date, default: () => new Date() },
    out: { type: Date, default: null },
  },
  { _id: false }
)

const SessionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    dt: { type: Date, required: true, index: true },
    topic: { type: String, default: 'Public Speaking', trim: true },
    capacity: { type: Number, default: 10, min: 1 },

    price: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'CAD', uppercase: true, trim: true },

    // Branch this session belongs to. Stored as the Branch.id string so it
    // matches the identifiers carried on member.branchIds. Existing data
    // without a branch remains queryable (empty string) until migrated.
    branchId: { type: String, default: '', index: true, trim: true },

    reg: { type: [String], default: [] },
    att: { type: [AttendanceSchema], default: [] },
  },
  { timestamps: true }
)

SessionSchema.index({ dt: 1, topic: 1 })

SessionSchema.method('toClientJSON', function () {
  const s = this.toObject()
  return {
    id: s.id,
    dt: s.dt instanceof Date ? s.dt.toISOString() : s.dt,
    topic: s.topic,
    capacity: s.capacity,
    price: Number(s.price || 0),
    currency: s.currency || 'CAD',
    branchId: s.branchId || '',
    reg: Array.isArray(s.reg) ? s.reg : [],
    att: Array.isArray(s.att)
      ? s.att.map((a) => ({
          badge: a.badge,
          seat: a.seat || '',
          ts: a.ts ? new Date(a.ts).toISOString() : null,
          out: a.out ? new Date(a.out).toISOString() : null,
        }))
      : [],
  }
})

export default mongoose.models.Session || mongoose.model('Session', SessionSchema)
