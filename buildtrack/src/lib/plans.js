// Single source of truth for plan pricing/limits, reused by AccountPage's
// billing section, the pricing page and the prerendered landing metadata so
// copy never drifts. Keep this file free of imports.
export const PLANS = {
  standard: { maxWorkers: 10, maxActiveProjects: 3, priceMonthly: 29, priceAnnual: 278.40 },
  pro:      { maxWorkers: null, maxActiveProjects: null, priceMonthly: 59, priceAnnual: 566.40 },
  trial:    { maxWorkers: 3, maxActiveProjects: 1 },
}

// What a foreman may have right now. The 30-day trial is deliberately small (1 project,
// 3 workers) so a trying foreman sees the product without getting Pro for free;
// Standard and Pro are the paid plans.
export function limitsFor(profile) {
  if (profile?.plan === 'pro') return PLANS.pro
  if (profile?.plan === 'standard') return PLANS.standard
  return PLANS.trial
}


export function fmtPrice(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}
