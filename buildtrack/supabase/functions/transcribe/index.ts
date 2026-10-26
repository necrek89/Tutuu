import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { budgetFor, usedFor, addUsage, TRANSCRIBE_COST } from '../_shared/quota.ts'

// Speech to text for the assistant's microphone. The app records audio and
// posts the raw recording here ; we return { text }.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const OPENAI_KEY   = Deno.env.get('OPENAI_API_KEY')
const MODEL        = Deno.env.get('TRANSCRIBE_MODEL') || 'gpt-4o-mini-transcribe'
const FALLBACK     = 'whisper-1'

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type' }
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// No language is forced (people mix languages) and no prompt is sent: a vocabulary prompt
// made the model read the prompt back into the transcript on short or quiet clips.
// Well-known "phantom" phrases it invents on near-silence are dropped instead.
const PHANTOM = /^(продолжение следует|субтитры[^.]*|спасибо за просмотр|thanks for watching|thank you\.?|dimatorzok|редактор субтитров[^.]*)[.!\s]*$/i

const hits = new Map<string, number[]>()
function limited(userId: string) {
  const now = Date.now()
  const recent = (hits.get(userId) || []).filter(t => now - t < 10 * 60 * 1000)
  recent.push(now)
  hits.set(userId, recent)
  return recent.length > 40
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const jwt = (req.headers.get('authorization') || '').replace('Bearer ', '')
    const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt)
    if (authErr || !user) return json({ error: 'unauthorized' }, 401)
    if (limited(user.id)) return json({ error: 'busy' }, 429)
    if (!OPENAI_KEY) return json({ error: 'unavailable' }, 503)

    const { who, budget, lifetime } = await budgetFor(supabase, user.id)
    if (who === 'locked') return json({ error: 'locked' }, 403)
    const used = await usedFor(supabase, user.id, lifetime)
    if (used !== null && used >= budget) return json({ error: who === 'trial' ? 'trial_limit' : 'limit', quota: { used, budget } }, 429)

    if (Number(req.headers.get('content-length') || 0) > 6_000_000) return json({ error: 'bad_request' }, 400)
    const buf = await req.arrayBuffer()
    if (buf.byteLength < 1000 || buf.byteLength > 6_000_000) return json({ error: 'bad_request' }, 400)

    const type = req.headers.get('content-type') || 'audio/webm'
    const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : type.includes('wav') ? 'wav' : 'webm'

    const send = (model: string) => {
      const form = new FormData()
      form.append('file', new Blob([buf], { type }), `audio.${ext}`)
      form.append('model', model)
      return fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENAI_KEY}` },
        body: form,
      })
    }

    let res = await send(MODEL)
    // The fast model may be unavailable on this account: fall back to whisper-1
    if (!res.ok && MODEL !== FALLBACK && res.status >= 400 && res.status < 500 && res.status !== 429) {
      console.error('transcribe model', MODEL, res.status, (await res.text()).slice(0, 200))
      res = await send(FALLBACK)
    }
    if (!res.ok) {
      console.error('transcribe', res.status, (await res.text()).slice(0, 300))
      return json({ error: res.status === 429 ? 'busy' : 'unavailable' }, 503)
    }
    const out = await res.json()
    const total = await addUsage(supabase, user.id, TRANSCRIBE_COST)
    const text = String(out.text || '').trim()
    return json({ text: PHANTOM.test(text) ? '' : text, quota: total === null ? null : { used: total, budget } })
  } catch (e) {
    console.error('transcribe', e)
    return json({ error: 'server' }, 500)
  }
})
