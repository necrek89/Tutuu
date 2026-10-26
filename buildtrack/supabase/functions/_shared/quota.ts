// Per-user monthly AI budget, shared by the assistant and transcribe functions.
// Money is counted in micro-dollars (1_000_000 = $1). If the ai_usage table is
// missing or a query fails, these helpers return null and callers carry on
// (the monthly cap in the Anthropic/OpenAI consoles is the last safety net).

// Budgets by who is asking. Trial is for the whole 30 days, the rest are per month.
export const BUDGET_MICRO = { standard: 1_500_000, pro: 4_500_000, trial: 400_000, light: 600_000 }

// micro-dollars per token ($ per million tokens == micro-dollars per token)
const PRICE: Record<string, { in: number; out: number }> = {
  'claude-haiku-5-5':  { in: 0.1, out: 0.5 },
  'claude-sonnet-5-5': { in: 2,   out: 10 },
}
export const TRANSCRIBE_COST = 400 // about 5 s of speech, rounded up

export function anthropicCost(model: string, usage: any): number {
  const p = PRICE[model] || PRICE['claude-sonnet-5-5']
  // Prompt caching: writing the cache costs 1.25x the input price, reading it 0.1x
  return Math.ceil(
    (usage?.input_tokens || 0) * p.in +
    (usage?.cache_creation_input_tokens || 0) * p.in * 1.25 +
    (usage?.cache_read_input_tokens || 0) * p.in * 0.1 +
    (usage?.output_tokens || 0) * p.out,
  )
}

const month = () => new Date().toISOString().slice(0, 7)

// Same rules as the app's computeIsLocked (src/lib/billing.js)
const LOCKED_STATUSES = ['canceled', 'paused']
const ACTIVE_STATUSES = ['active', 'trialing', 'past_due']

type Who = 'standard' | 'pro' | 'trial' | 'locked' | 'light'
export type Budget = { who: Who; budget: number; lifetime: boolean }

function foremanKind(p: any): Who {
  const st = p?.subscription_status
  if (st && LOCKED_STATUSES.includes(st)) return 'locked'
  if (st && ACTIVE_STATUSES.includes(st)) return p?.plan === 'pro' ? 'pro' : 'standard'
  if (p?.trial_ends_at && new Date(p.trial_ends_at).getTime() < Date.now()) return 'locked'
  return 'trial'
}

async function foremanOf(supabase: any, userId: string): Promise<string | null> {
  const { data: pw } = await supabase.from('project_workers').select('project:projects(foreman_id)').eq('worker_id', userId).limit(1)
  const viaProject = pw?.[0]?.project?.foreman_id
  if (viaProject) return viaProject
  const { data: jr } = await supabase.from('join_requests').select('foreman_id').eq('worker_id', userId).eq('status', 'approved').limit(1)
  return jr?.[0]?.foreman_id || null
}

export async function budgetFor(supabase: any, userId: string): Promise<Budget> {
  const cols = 'role, plan, trial_ends_at, subscription_status'
  const { data: me } = await supabase.from('profiles').select(cols).eq('id', userId).single()
  let who: Who
  if (me?.role === 'foreman') {
    who = foremanKind(me)
  } else {
    // Workers and managers: off when their foreman's plan is locked, otherwise a small monthly allowance
    const foremanId = await foremanOf(supabase, userId)
    let boss: Who = 'light'
    if (foremanId) {
      const { data: f } = await supabase.from('profiles').select(cols).eq('id', foremanId).single()
      if (f && foremanKind(f) === 'locked') boss = 'locked'
    }
    who = boss
  }
  const budget = who === 'locked' ? 0 : BUDGET_MICRO[who as 'standard' | 'pro' | 'trial' | 'light']
  return { who, budget, lifetime: who === 'trial' }
}

// Trial budget counts every month, the others only the current one
export async function usedFor(supabase: any, userId: string, lifetime: boolean): Promise<number | null> {
  let q = supabase.from('ai_usage').select('cost_micro').eq('user_id', userId)
  if (!lifetime) q = q.eq('month', month())
  const { data, error } = await q
  if (error) { console.error('quota read', error.message); return null }
  return (data || []).reduce((n: number, r: any) => n + Number(r.cost_micro || 0), 0)
}

export async function addUsage(supabase: any, userId: string, cost: number): Promise<number | null> {
  const { data, error } = await supabase.rpc('ai_add_usage', { p_user: userId, p_month: month(), p_cost: Math.max(1, Math.round(cost)) })
  if (error) { console.error('quota write', error.message); return null }
  return Number(data)
}
