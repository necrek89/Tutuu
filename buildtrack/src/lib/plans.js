// Single source of truth for plan pricing/limits, reused by AccountPage's
// billing section, the pricing page and the prerendered landing metadata so
// copy never drifts. Keep this file free of imports.
export const PLANS = {
  standard: { maxWorkers: 10, maxActiveProjects: 3, priceMonthly: 29, priceAnnual: 278.40 },
  pro:      { maxWorkers: null, maxActiveProjects: null, priceMonthly: 59, priceAnnual: 566.40 },
}

export function fmtPrice(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}
