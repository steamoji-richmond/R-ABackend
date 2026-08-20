/**
 * Compute the price a given member must pay for a session.
 *
 * Rules:
 *  - Annual members          → FREE (no payment required)
 *  - Non-annual members      → 40% off session.price (pay 60%)
 *  - Non-Steamoji / no membership → 100% of session.price
 *  - If session.price <= 0  → FREE for everyone
 */
export function computePrice(session, member) {
  const basePrice = Number(session?.price) || 0
  const currency = 'CAD'

  if (basePrice <= 0) {
    return {
      amount: 0,
      currency,
      membershipType: normalizedType(member),
      status: 'not_required',
      isFree: true,
      note: 'Session is free',
    }
  }

  const type = normalizedType(member)

  if (type === 'yearly') {
    return {
      amount: 0,
      currency,
      membershipType: 'yearly',
      status: 'not_required',
      isFree: true,
      note: 'Free for annual members',
    }
  }

  if (type === 'semi-yearly') {
    return {
      amount: round2(basePrice * 0.6),
      currency,
      membershipType: 'semi-yearly',
      status: 'pending',
      isFree: false,
      note: '40% discount for non-annual members',
    }
  }

  return {
    amount: round2(basePrice),
    currency,
    membershipType: 'none',
    status: 'pending',
    isFree: false,
    note: 'Full price (non-Steamoji member)',
  }
}

function normalizedType(member) {
  const t = (member && member.membershipType) || 'none'
  return ['yearly', 'semi-yearly', 'none'].includes(t) ? t : 'none'
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100
}
