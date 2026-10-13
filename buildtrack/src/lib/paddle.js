// Paddle.js is loaded on demand (loadPaddle) so the landing and the rest of the
// site don't pay for it; only the Account page, where checkout lives, calls it.
// This module also deals with initializing it and opening checkout. Every function here is a safe no-op
// until real Paddle env vars exist, so the billing UI can ship now without
// a live Paddle account.

const CLIENT_TOKEN = import.meta.env.VITE_PADDLE_CLIENT_TOKEN
const ENV = import.meta.env.VITE_PADDLE_ENV || 'sandbox'

const PRICE_IDS = {
  standard: {
    monthly: import.meta.env.VITE_PADDLE_PRICE_STANDARD_MONTHLY,
    annual:  import.meta.env.VITE_PADDLE_PRICE_STANDARD_ANNUAL,
  },
  pro: {
    monthly: import.meta.env.VITE_PADDLE_PRICE_PRO_MONTHLY,
    annual:  import.meta.env.VITE_PADDLE_PRICE_PRO_ANNUAL,
  },
}

export function isPaddleConfigured() {
  return !!CLIENT_TOKEN
}

const PADDLE_SRC = 'https://cdn.paddle.com/paddle/v2/paddle.js'
let loading = null

// Injects paddle.js once. Resolves when window.Paddle exists (or on failure,
// so callers never hang; openCheckout simply returns false until it is ready).
export function loadPaddle() {
  if (typeof window === 'undefined' || !isPaddleConfigured()) return Promise.resolve(false)
  if (window.Paddle) return Promise.resolve(true)
  if (loading) return loading
  loading = new Promise((resolve) => {
    const el = document.createElement('script')
    el.src = PADDLE_SRC
    el.async = true
    el.onload = () => resolve(true)
    el.onerror = () => { loading = null; resolve(false) }
    document.head.appendChild(el)
  })
  return loading
}

export function getPriceId(plan, period) {
  return PRICE_IDS[plan]?.[period] || null
}

let initialized = false
function ensureInitialized() {
  if (initialized || !isPaddleConfigured() || typeof window.Paddle === 'undefined') return initialized
  window.Paddle.Environment.set(ENV)
  window.Paddle.Initialize({ token: CLIENT_TOKEN })
  initialized = true
  return true
}

// Returns false (and does nothing) if Paddle isn't configured yet or this
// specific price id hasn't been set — callers should keep the triggering
// button disabled in that case rather than relying on this to fail loudly.
export function openCheckout(plan, period, profile) {
  const priceId = getPriceId(plan, period)
  if (!priceId || !ensureInitialized()) return false
  window.Paddle.Checkout.open({
    items: [{ priceId, quantity: 1 }],
    customer: profile?.email ? { email: profile.email } : undefined,
    customData: { profile_id: profile?.id },
  })
  return true
}
