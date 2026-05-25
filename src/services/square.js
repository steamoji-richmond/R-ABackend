/**
 * Square payment service — per-branch credentials.
 *
 * Credentials come from the branch document stored in MongoDB:
 *   branch.squareEnv           – 'sandbox' | 'production'
 *   branch.squareAccessToken   – Square access token
 *   branch.squareLocationId    – Square location ID
 *   branch.squareApplicationId – Square application ID
 *
 * The global CHECKOUT_REDIRECT_URL env var is still used for the return URL
 * since it is the same for all branches (it's your app's /payment/return page).
 *
 * If a branch has no Square credentials configured, a mock checkout link is
 * returned so the flow is testable without real credentials.
 */

import { nanoid } from 'nanoid'
import { config } from '../config.js'

function getSquareCreds(branch) {
  return {
    env: branch?.squareEnv || 'sandbox',
    accessToken: branch?.squareAccessToken?.trim() || '',
    locationId: branch?.squareLocationId?.trim() || '',
    applicationId: branch?.squareApplicationId?.trim() || '',
  }
}

function baseUrl(env) {
  return env === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com'
}

function isConfigured(creds) {
  return !!(creds.accessToken && creds.locationId)
}

/**
 * Create a checkout/payment-link for a registration.
 * Returns { paymentId, checkoutUrl, status }.
 *
 * @param {Object} p
 * @param {Object} p.registration
 * @param {Object} p.session
 * @param {Object|null} p.branch   - Branch document (with Square creds)
 */
export async function createCheckout({ registration, session, branch }) {
  const creds = getSquareCreds(branch)
  const amountCents = Math.round(Number(registration.priceAmount || 0) * 100)
  const currency = (registration.currency || 'USD').toUpperCase()
  const orderName = `Workshop: ${session.topic} (${new Date(session.dt).toDateString()})`
  const redirectUrl = config.square.redirectUrl

  if (!isConfigured(creds)) {
    console.warn(
      `[square] Branch "${branch?.name || '?'}" has no Square credentials — returning mock checkout`
    )
    return {
      paymentId: `mock_${nanoid(10)}`,
      checkoutUrl: `${redirectUrl}?mock=1&reg=${encodeURIComponent(registration.id)}`,
      status: 'mock',
      provider: 'square-mock',
    }
  }

  const idemKey = nanoid()
  const body = {
    idempotency_key: idemKey,
    quick_pay: {
      name: orderName,
      price_money: { amount: amountCents, currency },
      location_id: creds.locationId,
    },
    checkout_options: {
      redirect_url: `${redirectUrl}?reg=${encodeURIComponent(registration.id)}`,
      ask_for_shipping_address: false,
    },
    pre_populated_data: registration.parentEmail
      ? { buyer_email: registration.parentEmail }
      : undefined,
  }

  const res = await fetch(`${baseUrl(creds.env)}/v2/online-checkout/payment-links`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${creds.accessToken}`,
      'Square-Version': '2024-10-17',
    },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) {
    const err = json?.errors?.[0]?.detail || `Square HTTP ${res.status}`
    throw new Error(err)
  }
  // Store the order_id as the payment reference — this is what we verify
  // against later. payment_link.id is only the link itself, not the payment.
  return {
    paymentId: json?.payment_link?.order_id || idemKey,
    checkoutUrl: json?.payment_link?.url || '',
    status: 'created',
    provider: 'square',
  }
}

/**
 * Verify a payment link payment by checking the Square order.
 * The orderId stored on the registration is `payment_link.order_id`.
 * Square order states: OPEN (unpaid) | COMPLETED (paid) | CANCELED.
 *
 * @param {string} orderId   - The Square order_id stored on the registration
 * @param {Object|null} branch
 */
export async function verifyPayment(orderId, branch) {
  const creds = getSquareCreds(branch)
  if (!isConfigured(creds)) return { status: 'mock_paid', paid: true }

  const res = await fetch(`${baseUrl(creds.env)}/v2/orders/${encodeURIComponent(orderId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      'Square-Version': '2024-10-17',
      Accept: 'application/json',
    },
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.errors?.[0]?.detail || `Square HTTP ${res.status}`)

  const order = json?.order
  const state = order?.state || 'OPEN'
  const totalMoney = order?.total_money || {}

  return {
    status: state,
    paid: state === 'COMPLETED',
    amount: totalMoney.amount ? totalMoney.amount / 100 : 0,
    currency: totalMoney.currency || 'CAD',
  }
}
