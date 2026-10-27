import { supabase } from './supabase'

// Plan pricing/limits live in ./plans (no imports, so the prerendered public
// pages can use them without loading the Supabase client). Re-exported here so
// the app's existing imports keep working.
export { PLANS, fmtPrice, limitsFor } from './plans'

// Opens Paddle's hosted Customer Portal in a new tab, where the foreman can
// cancel their subscription or update their card. Returns { ok: true } on
// success, or { ok: false, error } with the raw failure reason so the UI can
// show it directly — this endpoint fails in enough different ways (missing
// subscription, Paddle permission scope, expired session) that a generic
// "something went wrong" isn't enough to debug from.
export async function openBillingPortal() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { ok: false, error: 'Not signed in' }
  try {
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paddle-portal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    const text = await res.text()
    if (!res.ok) return { ok: false, error: `${res.status}: ${text}` }
    const { url } = JSON.parse(text)
    if (!url) return { ok: false, error: 'No portal URL returned' }
    window.open(url, '_blank', 'noopener')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

const TRIAL_DAYS = 30
const LOCKED_STATUSES = ['canceled', 'paused']
const ACTIVE_STATUSES = ['active', 'trialing', 'past_due'] // past_due = grace period during Paddle's dunning retries

export function computeIsLocked({ trial_ends_at, subscription_status } = {}) {
  if (subscription_status && LOCKED_STATUSES.includes(subscription_status)) return true
  if (subscription_status && ACTIVE_STATUSES.includes(subscription_status)) return false
  if (!trial_ends_at) return false // never lock on missing/unbackfilled data
  return new Date(trial_ends_at).getTime() < Date.now()
}

export function getTrialDaysLeft({ trial_ends_at } = {}) {
  if (!trial_ends_at) return 0
  const ms = new Date(trial_ends_at).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / 86400000))
}

// Finds the foreman a worker/manager belongs to. Managers always land in
// project_workers directly; a worker can be in the crew via an approved
// join_requests row before being assigned to any project — mirrors the two
// sources _buildRoster() already combines, just from the opposite direction
// (one worker -> their one foreman, instead of one foreman -> all workers).
async function resolveForemanId(workerId) {
  const { data: pw } = await supabase
    .from('project_workers')
    .select('project:projects(foreman_id)')
    .eq('worker_id', workerId)
    .limit(1)
  const viaProject = pw?.[0]?.project?.foreman_id
  if (viaProject) return viaProject

  const { data: jr } = await supabase
    .from('join_requests')
    .select('foreman_id')
    .eq('worker_id', workerId)
    .eq('status', 'approved')
    .limit(1)
  return jr?.[0]?.foreman_id || null
}

// Called right after `profile` is fetched, from signIn/checkSession/fetchProfile.
// Returns { isLocked, billingForemanId, trialEndsAt } — trialEndsAt is only set
// when this call just backfilled it (so the caller can patch its local profile
// object without a second round-trip).
export async function resolveBillingState(profile) {
  if (!profile) return { isLocked: false, billingForemanId: null, trialEndsAt: null }

  if (profile.role === 'foreman') {
    let trialEndsAt = profile.trial_ends_at
    if (!trialEndsAt) {
      trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86400000).toISOString()
      await supabase.from('profiles').update({ trial_ends_at: trialEndsAt }).eq('id', profile.id)
    }
    return {
      isLocked: computeIsLocked({ trial_ends_at: trialEndsAt, subscription_status: profile.subscription_status }),
      billingForemanId: profile.id,
      trialEndsAt,
    }
  }

  const foremanId = await resolveForemanId(profile.id)
  if (!foremanId) return { isLocked: false, billingForemanId: null, trialEndsAt: null }

  const { data: foreman } = await supabase
    .from('profiles')
    .select('trial_ends_at, subscription_status')
    .eq('id', foremanId)
    .single()

  return { isLocked: computeIsLocked(foreman || {}), billingForemanId: foremanId, trialEndsAt: null }
}
