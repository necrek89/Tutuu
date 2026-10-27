import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { budgetFor, usedFor, addUsage, anthropicCost } from '../_shared/quota.ts'
import { TOOLS, MORE_TOOLS, ROLE_TOOLS, systemPrompt, ROUTER_PROMPT, ADVISOR_PROMPT } from '../_shared/assistantSpec.ts'

// Turns what a foreman/worker says or types into proposed app actions. It only
// PROPOSES: nothing is written here, the app shows the draft and the user
// confirms, then the app applies it with the user's own session (so RLS and the
// subscription lock still decide what is allowed).
const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')!
// Two models only: Sonnet for actions (reliable), Haiku for questions and routing (cheap)
const SONNET        = 'claude-sonnet-5-5'
const HAIKU         = 'claude-haiku-5-5'

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type' }
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// Abuse guard per function instance (not a billing limit; the monthly cap in the
// Anthropic console is the hard stop).
const hits = new Map<string, number[]>()
const WINDOW_MS = 10 * 60 * 1000
const MAX_HITS  = 25
function limited(userId: string) {
  const now = Date.now()
  const recent = (hits.get(userId) || []).filter(t => now - t < WINDOW_MS)
  recent.push(now)
  hits.set(userId, recent)
  return recent.length > MAX_HITS
}

const str = (v: unknown, n: number) => String(v ?? '').slice(0, n)

async function claude(model: string, system: string, messages: any[], opts: { tools?: any[]; max_tokens: number }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: opts.max_tokens, system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }], messages, ...(opts.tools?.length ? { tools: opts.tools } : {}) }),
  })
  if (!res.ok) {
    console.error('anthropic', model, res.status, (await res.text()).slice(0, 300))
    // 429/529 = overloaded, anything else = key or balance problem
    throw new Error(res.status === 429 || res.status === 529 ? 'busy' : 'unavailable')
  }
  const out = await res.json()
  return { out, cost: anthropicCost(model, out.usage), cutOff: out.stop_reason === 'max_tokens' }
}
const textOf = (out: any) => (Array.isArray(out.content) ? out.content : []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim()

// Checks a tool call against the JSON schema subset the tools use (type, required, enum, items)
function matches(schema: any, v: any): boolean {
  if (!schema) return true
  switch (schema.type) {
    case 'object': {
      if (v === null || typeof v !== 'object' || Array.isArray(v)) return false
      for (const k of schema.required || []) if (v[k] === undefined || v[k] === null) return false
      for (const [k, sub] of Object.entries(schema.properties || {})) if (v[k] !== undefined && v[k] !== null && !matches(sub, v[k])) return false
      return true
    }
    case 'array': return Array.isArray(v) && v.every((x: any) => matches(schema.items, x))
    case 'string': return typeof v === 'string' && (!schema.enum || schema.enum.includes(v))
    case 'integer': return Number.isInteger(v)
    case 'number': return typeof v === 'number' && Number.isFinite(v)
    case 'boolean': return typeof v === 'boolean'
    default: return true
  }
}

// An answer is usable when every tool call fits its schema, and there is either a tool call or some text
function wellFormed(out: any, toolList: any[]): boolean {
  const blocks: any[] = Array.isArray(out.content) ? out.content : []
  const calls = blocks.filter(b => b.type === 'tool_use')
  if (!calls.length) return textOf(out).length > 0
  return calls.every(c => { const def = toolList.find(t => t.name === c.name); return !!def && matches(def.input_schema, c.input) })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const jwt = (req.headers.get('authorization') || '').replace('Bearer ', '')
    const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt)
    if (authErr || !user) return json({ error: 'unauthorized' }, 401)
    if (limited(user.id)) return json({ error: 'busy' }, 429)

    if (Number(req.headers.get('content-length') || 0) > 6_000_000) return json({ error: 'too_large' }, 413)
    const body = await req.json()

    const messages = (Array.isArray(body.messages) ? body.messages : [])
      .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-8)
      .map((m: any) => ({ role: m.role, content: str(m.content, 3000) }))
    if (!messages.length || messages[messages.length - 1].role !== 'user') return json({ error: 'bad_request' }, 400)

    const images = (Array.isArray(body.images) ? body.images : [])
      .filter((x: unknown) => typeof x === 'string' && (x as string).length < 700_000)
      .slice(0, 5) as string[]
    if (images.length) {
      const last = messages[messages.length - 1]
      last.content = [
        ...images.flatMap((data, i) => [
          { type: 'text', text: `Photo ${i + 1}:` },
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } },
        ]),
        { type: 'text', text: last.content },
      ] as any
    }

    const { data: profile } = await supabase.from('profiles').select('role, name').eq('id', user.id).single()
    const role = profile?.role || 'worker'
    const allowed = ROLE_TOOLS[role] || []
    if (!allowed.length) return json({ error: 'forbidden' }, 403)

    const { who, budget, lifetime } = await budgetFor(supabase, user.id)
    if (who === 'locked') return json({ error: 'locked' }, 403)
    const used = await usedFor(supabase, user.id, lifetime)
    if (used !== null && used >= budget) return json({ error: who === 'trial' ? 'trial_limit' : 'limit', quota: { used, budget } }, 429)
    let spent = 0

    const c = body.context || {}
    const context = {
      today: str(c.today, 10),
      role,
      user: str(profile?.name, 80),
      projects: (Array.isArray(c.projects) ? c.projects : []).slice(0, 40).map((p: any) => ({
        id: Number(p.id), name: str(p.name, 80), status: p.status ? str(p.status, 12) : undefined, address: p.address ? str(p.address, 80) : undefined, deadline: p.deadline ? str(p.deadline, 10) : undefined,
        stages: (Array.isArray(p.stages) ? p.stages : []).slice(0, 30).map((s: unknown) => str(s, 60)),
        zones:  (Array.isArray(p.zones)  ? p.zones  : []).slice(0, 30).map((s: unknown) => str(s, 60)),
      })),
      tasks: (Array.isArray(c.tasks) ? c.tasks : []).slice(0, 120).map((tk: any) => ({
        id: Number(tk.id), project_id: Number(tk.project_id), text: str(tk.text, 120), stage: tk.stage ? str(tk.stage, 60) : null,
        zone: tk.zone ? str(tk.zone, 60) : null,
        description: tk.description ? str(tk.description, 160) : null,
        deadline: tk.deadline ? str(tk.deadline, 10) : null, status: str(tk.status, 12),
        assignee: tk.assignee ? str(tk.assignee, 80) : null,
      })),
      workers: (Array.isArray(c.workers) ? c.workers : []).slice(0, 150).map((w: any) => ({
        id: str(w.id, 40), name: str(w.name, 80),
        rate: w.rate != null ? Number(w.rate) || 0 : undefined, rate_type: w.rate_type ? str(w.rate_type, 8) : undefined,
        status: w.status ? str(w.status, 12) : undefined,
      })),
      currency: str(c.currency, 4),
      expenses: (Array.isArray(c.expenses) ? c.expenses : []).slice(0, 30).map((e: any) => ({
        id: Number(e.id), project_id: Number(e.project_id), title: str(e.title, 80), amount: Number(e.amount) || 0,
        currency: str(e.currency, 4), category: str(e.category, 12), date: str(e.date, 10),
      })),
      work_logs: (Array.isArray(c.work_logs) ? c.work_logs : []).slice(0, 30).map((l: any) => ({
        id: Number(l.id), worker_id: str(l.worker_id, 40), date: str(l.date, 10), type: str(l.type, 8), value: Number(l.value) || 0, rate: Number(l.rate) || 0,
      })),
      payments: (Array.isArray(c.payments) ? c.payments : []).slice(0, 20).map((x: any) => ({
        id: Number(x.id), worker_id: str(x.worker_id, 40), amount: Number(x.amount) || 0, date: str(x.date, 10), notes: x.notes ? str(x.notes, 60) : null,
      })),
      tools: (Array.isArray(c.tools) ? c.tools : []).slice(0, 40).map((x: any) => ({
        id: Number(x.id), name: str(x.name, 60), status: str(x.status, 10), location: x.location ? str(x.location, 60) : null,
        project_id: x.project_id != null ? Number(x.project_id) : null, worker_id: x.worker_id ? str(x.worker_id, 40) : null,
      })),
      materials: (Array.isArray(c.materials) ? c.materials : []).slice(0, 40).map((m: any) => ({
        id: Number(m.id), project_id: m.project_id != null ? Number(m.project_id) : null, name: str(m.name, 60), qty: Number(m.qty) || null, unit: m.unit ? str(m.unit, 8) : null, status: str(m.status, 10),
      })),
      join_requests: (Array.isArray(c.join_requests) ? c.join_requests : []).slice(0, 10).map((r: any) => ({ id: Number(r.id), worker_id: str(r.worker_id, 40), name: str(r.name, 80) })),
    }

    const lastText = messages[messages.length - 1].content
    const textOnly = (m: any) => typeof m.content === 'string'
    // Anything that needs reliability goes straight to Sonnet: photos, editing a
    // draft, or long messages. Short plain messages are routed by Haiku first.
    const needsSonnet = images.length > 0 || body.hasDraft === true || (typeof lastText === 'string' && lastText.length > 350)

    let answered: { reply: string; actions: any[] } | null = null
    try {
      if (!needsSonnet) {
        const recent = messages.slice(-3).filter(textOnly)
        const route = await claude(HAIKU, ROUTER_PROMPT, recent, { max_tokens: 5 })
        spent += route.cost
        if (textOf(route.out).toLowerCase().startsWith('question')) {
          const adv = await claude(HAIKU, ADVISOR_PROMPT, messages.filter(textOnly), { max_tokens: 1000 })
          spent += adv.cost
          let reply = textOf(adv.out)
          // If it still ran out of room, end on the last complete sentence instead of mid-word
          if (adv.cutOff) {
            const end = Math.max(reply.lastIndexOf('. '), reply.lastIndexOf('.\n'), reply.lastIndexOf('! '), reply.lastIndexOf('? '), reply.lastIndexOf('\n'))
            if (end > reply.length * 0.4) reply = reply.slice(0, end + 1).trim()
          }
          if (reply && !reply.includes('[[ACTION]]')) answered = { reply, actions: [] }
        }
      }

      if (!answered) {
        const toolList = [...TOOLS, ...MORE_TOOLS].filter(t => allowed.includes(t.name))
        // Short plain commands go to Haiku (about 16x cheaper); long dictations, photos and edits of a
        // draft go to Sonnet. If Haiku's answer is malformed or cut off, Sonnet does it again.
        let model = needsSonnet ? SONNET : HAIKU
        let act = await claude(model, systemPrompt(context), messages, { tools: toolList, max_tokens: 8000 })
        spent += act.cost
        if (model === HAIKU && (act.cutOff || !wellFormed(act.out, toolList))) {
          console.log(JSON.stringify({ assistant: 'escalated_to_sonnet', reason: act.cutOff ? 'cut_off' : 'malformed_or_empty' }))
          model = SONNET
          act = await claude(model, systemPrompt(context), messages, { tools: toolList, max_tokens: 8000 })
          spent += act.cost
        }
        console.log(JSON.stringify({ assistant: 'action', model, chars: typeof lastText === 'string' ? lastText.length : 0, cost: act.cost }))
        // A tool call that ran out of room is cut mid-way: say so instead of showing a reply that claims it was done
        if (act.cutOff) {
          await addUsage(supabase, user.id, spent)
          return json({ error: 'too_long' }, 422)
        }
        const blocks: any[] = Array.isArray(act.out.content) ? act.out.content : []
        answered = {
          reply: textOf(act.out),
          actions: blocks.filter(b => b.type === 'tool_use' && allowed.includes(b.name)).map(b => ({ tool: b.name, input: b.input })),
        }
      }
    } catch (e) {
      // Calls that already ran still cost money
      if (spent) await addUsage(supabase, user.id, spent)
      return json({ error: (e as Error).message === 'busy' ? 'busy' : 'unavailable' }, 503)
    }

    const total = await addUsage(supabase, user.id, spent)
    return json({ ...answered, quota: total === null ? null : { used: total, budget } })
  } catch (e) {
    console.error('assistant', e)
    return json({ error: 'server' }, 500)
  }
})
