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

const SQUARE_VERSION = '2024-10-17'

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

function squareHeaders(creds, extra = {}) {
  return {
    Authorization: `Bearer ${creds.accessToken}`,
    'Square-Version': SQUARE_VERSION,
    Accept: 'application/json',
    ...extra,
  }
}

async function squareFetch(url, creds, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: squareHeaders(creds, options.headers),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(json?.errors?.[0]?.detail || `Square HTTP ${res.status}`)
  }
  return json
}

async function retrievePayment(paymentId, creds) {
  const json = await squareFetch(
    `${baseUrl(creds.env)}/v2/payments/${encodeURIComponent(paymentId)}`,
    creds
  )
  return json?.payment || null
}

async function searchCompletedPaymentsForOrder(orderId, creds) {
  try {
    const json = await squareFetch(`${baseUrl(creds.env)}/v2/payments/search`, creds, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: {
          filter: {
            order_filter: { order_id: orderId },
          },
        },
      }),
    })
    return (json?.payments || []).some((p) => p.status === 'COMPLETED')
  } catch (err) {
    console.warn('[square] payment search failed:', err.message)
    return false
  }
}

/**
 * Payment-link orders often stay OPEN after a successful charge.
 * Treat an order as paid when Square shows no balance due or a completed payment.
 */
async function orderIsPaid(order, creds) {
  if (!order) return false

  if (order.state === 'COMPLETED') return true

  const due = order.net_amount_due_money?.amount
  const total = order.total_money?.amount ?? 0
  if (total > 0 && due === 0) return true

  const tenders = order.tenders || []
  for (const tender of tenders) {
    const cardStatus = tender.card_details?.status
    if (cardStatus === 'CAPTURED') return true

    const paymentId = tender.payment_id
    if (!paymentId) continue
    try {
      const payment = await retrievePayment(paymentId, creds)
      if (payment?.status === 'COMPLETED') return true
    } catch (err) {
      console.warn('[square] retrieve payment failed:', paymentId, err.message)
    }
  }

  if (order.id) {
    return searchCompletedPaymentsForOrder(order.id, creds)
  }

  return false
}

/**
 * Create a checkout/payment-link for a registration.
 * Returns { paymentId, checkoutUrl, status }.
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

  const json = await squareFetch(`${baseUrl(creds.env)}/v2/online-checkout/payment-links`, creds, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  return {
    paymentId: json?.payment_link?.order_id || idemKey,
    checkoutUrl: json?.payment_link?.url || '',
    status: 'created',
    provider: 'square',
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Verify a payment-link order. Retries briefly — Square may still be settling
 * when the customer lands on the return URL.
 */
export async function verifyPayment(orderId, branch, { retries = 4, delayMs = 2000 } = {}) {
  const creds = getSquareCreds(branch)
  if (!isConfigured(creds)) return { status: 'mock_paid', paid: true }

  let lastResult = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(delayMs)

    const json = await squareFetch(
      `${baseUrl(creds.env)}/v2/orders/${encodeURIComponent(orderId)}`,
      creds
    )
    const order = json?.order
    if (!order) throw new Error('Square order not found')

    const paid = await orderIsPaid(order, creds)
    const state = order.state || 'OPEN'
    const totalMoney = order.total_money || {}

    lastResult = {
      status: paid ? 'COMPLETED' : state,
      paid,
      amount: totalMoney.amount ? totalMoney.amount / 100 : 0,
      currency: totalMoney.currency || 'CAD',
    }

    if (paid) return lastResult
  }

  return lastResult || { status: 'OPEN', paid: false, amount: 0, currency: 'CAD' }
}
