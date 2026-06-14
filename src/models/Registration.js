import mongoose from 'mongoose'

/**
 * Registration stores ONLY facts specific to this registration event:
 *  - which member (memberId → Member)
 *  - which session + denormalized session stamp (date/time/topic) for fast CSV export
 *  - what they paid, when, and how
 *
 * Profile fields (name, badge, email, phone, age, house, level, school, parent)
 * live on Member and are joined on read, so there's a single source of truth.
 */
const RegistrationSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },

    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Member',
      required: true,
      index: true,
    },

    sessionId: { type: String, required: true, index: true },
    sessionDate: { type: String, default: '' },
    sessionTime: { type: String, default: '' },
    sessionTopic: { type: String, default: '' },

    registeredBy: { type: String, default: '' },
    registeredDateAndTime: { type: Date, default: () => new Date() },

    priceAmount: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'USD', uppercase: true },
    membershipType: {
      type: String,
      enum: ['yearly', 'semi-yearly', 'none'],
      default: 'none',
    },
    paymentStatus: {
      type: String,
      enum: ['not_required', 'pending', 'paid', 'failed', 'refunded'],
      default: 'not_required',
      index: true,
    },
    paymentProvider: { type: String, default: '' },
    paymentId: { type: String, default: '' },
    paymentCheckoutUrl: { type: String, default: '' },
    paidAt: { type: Date, default: null },
    confirmationEmailSentAt: { type: Date, default: null },
  },
  { timestamps: true }
)

RegistrationSchema.index({ memberId: 1, sessionId: 1 }, { unique: true })
RegistrationSchema.index({ sessionId: 1, registeredDateAndTime: -1 })

export default mongoose.models.Registration ||
  mongoose.model('Registration', RegistrationSchema)
