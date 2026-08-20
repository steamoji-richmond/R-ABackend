/** Canadian GST applied at checkout (5%). */
export const GST_RATE = 0.05
export const GST_NAME = 'GST'

function round2(n) {
  return Math.round(Number(n) * 100) / 100
}

/**
 * @param {number} subtotal Pre-tax amount (session price after membership discount)
 * @returns {{ subtotal: number, gstAmount: number, total: number, gstRate: number }}
 */
export function computeGstBreakdown(subtotal) {
  const base = round2(subtotal)
  if (base <= 0) {
    return { subtotal: 0, gstAmount: 0, total: 0, gstRate: GST_RATE }
  }
  const gstAmount = round2(base * GST_RATE)
  const total = round2(base + gstAmount)
  return { subtotal: base, gstAmount, total, gstRate: GST_RATE }
}
