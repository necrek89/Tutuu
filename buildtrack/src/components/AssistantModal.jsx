import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { X, Microphone, PaperPlaneTilt, Sparkle, WarningCircle, Paperclip, Camera, Images, ArrowBendUpLeft, Trash, Copy, DotsThree } from '@phosphor-icons/react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/useLanguage'
import { buildContext, askAssistant, normalizeAction, applyAction, transcribeAudio, warmUpTranscribe } from '../lib/assistant'
import { prepareImage } from '../lib/imagePrep'
import { keepScreenAwake } from '../lib/keepAwake'

const SpeechRec = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null
// Preferred: record audio and transcribe on the server (accurate, same on every
// device). Fallback: the browser's own speech recognition.
// Server transcription (needs OPENAI_API_KEY in Supabase); VITE_SERVER_STT=false turns it off
const CAN_RECORD = import.meta.env.VITE_SERVER_STT !== 'false'
  && typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'
const pickMime = () => ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(m => MediaRecorder.isTypeSupported(m)) || ''
const MAX_RECORD_MS = 180000
const MAX_PHOTOS = 5
const toBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(String(r.result).split(',')[1])
  r.onerror = reject
  r.readAsDataURL(file)
})

// History lives on this device only (last 40 messages). Photos are not kept, and
// drafts that were still open become "expired" so an old draft is never applied by accident.
const HISTORY_MAX = 40
const historyKey = () => `tutuu_assistant_${useStore.getState().profile?.id || 'anon'}`
function loadHistory() {
  try {
    const list = JSON.parse(localStorage.getItem(historyKey()) || '[]')
    return Array.isArray(list)
      ? list.map(m => (['pending', 'applying', 'error'].includes(m.state) ? { ...m, state: 'expired' } : m))
      : []
  } catch { return [] }
}
function saveHistory(messages) {
  try {
    const slim = messages.slice(-HISTORY_MAX).map(m => ({
      role: m.role, content: m.content, quote: m.quote, raw: m.raw, actions: m.actions, state: m.state, error: m.error,
      photoCount: m.photoCount ?? m.photoUrls?.length ?? 0,
    }))
    localStorage.setItem(historyKey(), JSON.stringify(slim))
  } catch { /* storage full or blocked: history is a convenience */ }
}

// What the model sees of a message: the user's words (plus the quoted message) and,
// for assistant turns, the draft it proposed, so "add one more task" can edit it.
function toApi(m) {
  if (m.role === 'user') return { role: 'user', content: (m.quote ? `[replying to: "${m.quote}"]\n` : '') + m.content }
  const draft = m.raw?.length ? `\n[proposed: ${JSON.stringify(m.raw).slice(0, 2000)}]` : ''
  return { role: 'assistant', content: (m.content || '') + draft || '[reply]' }
}

function Thumbs({ idx, photos }) {
  if (!idx?.length || !photos?.length) return null
  return (
    <div className="assistant-thumbs">
      {idx.map(i => photos[i] && <img key={i} className="assistant-thumb" src={photos[i]} alt="" />)}
    </div>
  )
}

const SPEECH_LANG = { en: 'en-US', ru: 'ru-RU', sr: 'sr-RS', es: 'es-ES', pt: 'pt-PT', de: 'de-DE', fr: 'fr-FR', sk: 'sk-SK', cs: 'cs-CZ' }

function ActionPreview({ a, photos, onPick }) {
  const { t } = useT()
  const roster = useStore(s => s.roster)
  const workerName = (id) => roster.find(w => w.id === id)?.name

  if (a.tool === 'create_tasks') {
    const groups = []
    a.tasks.forEach(tk => {
      let g = groups.find(x => x.stage === tk.stage)
      if (!g) { g = { stage: tk.stage, isNew: tk.newStage, tasks: [] }; groups.push(g) }
      g.tasks.push(tk)
    })
    return (
      <div>
        <div className="assistant-card-title">{t('assistant.tasksIn', { name: a.project.name })}</div>
        {groups.map((g, gi) => (
          <div key={gi} style={{ marginTop: gi ? 8 : 0 }}>
            {g.stage && (
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {g.stage}{g.isNew && <span className="assistant-meta"> · {t('assistant.newStage')}</span>}
              </div>
            )}
            <ol className="assistant-list">
              {g.tasks.map((tk, i) => {
                const meta = [tk.zone, workerName(tk.worker_id), tk.deadline].filter(Boolean).join(' · ')
                return (
                  <li key={i} className="assistant-pick" onClick={() => onPick?.(`${g.stage ? g.stage + ': ' : ''}${tk.text}`)}>
                    {tk.text}
                    {meta && <span className="assistant-meta"> · {meta}</span>}
                    {tk.description && <div className="assistant-meta">{tk.description}</div>}
                    <Thumbs idx={tk.photoIdx} photos={photos} />
                  </li>
                )
              })}
            </ol>
          </div>
        ))}
        {a.warnings.length > 0 && (
          <div className="assistant-warn">
            <WarningCircle size={14} weight="bold" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>{a.warnings.map((w, i) => <div key={i}>{w}</div>)}</div>
          </div>
        )}
      </div>
    )
  }

  if (a.tool === 'update_task') {
    return (
      <div>
        <div className="assistant-card-title">{t('assistant.updateTitle')}</div>
        {a.updates.map((u, i) => (
          <div key={i} style={{ marginTop: i ? 8 : 0 }} className="assistant-pick" onClick={() => onPick?.(u.task.text)}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{u.task.text}</div>
            {Object.entries(u.changes).map(([field, val]) => (
              <div key={field} className="assistant-meta" style={{ marginTop: 2 }}>
                {t(`assistant.f_${field}`)}: {String(u.before[field] || '—')} {'→'} <b style={{ color: 'var(--text-primary)' }}>{field === 'worker_id' ? (roster.find(w => w.id === val)?.name || val) : field === 'status' ? t(`assistant.s_${val}`) : String(val || '—')}</b>
              </div>
            ))}
          </div>
        ))}
      </div>
    )
  }

  if (a.tool === 'delete_task') {
    return (
      <div>
        <div className="assistant-card-title" style={{ color: 'var(--danger)' }}>{t('assistant.deleteTitle', { n: a.tasks.length })}</div>
        <ul className="assistant-list">
          {a.tasks.map(tk => <li key={tk.id} className="assistant-pick" onClick={() => onPick?.(tk.text)}>{tk.text}</li>)}
        </ul>
      </div>
    )
  }

  if (a.tool === 'attach_photos') {
    return (
      <div>
        {a.attachments.map((at, i) => (
          <div key={i} style={{ marginTop: i ? 8 : 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{t('assistant.photoTo', { task: at.task.text })}</div>
            <Thumbs idx={at.photoIdx} photos={photos} />
          </div>
        ))}
      </div>
    )
  }

  if (a.tool === 'mark_attendance') {
    return (
      <div>
        <div className="assistant-card-title">{t('assistant.attendanceFor', { date: a.date })}</div>
        <ul className="assistant-list">
          {a.records.map(r => (
            <li key={r.worker_id} className="assistant-pick" onClick={() => onPick?.(`${r.name}: ${t(`assistant.st_${r.status}`)}`)}>
              {r.name}: {t(`assistant.st_${r.status}`)}{r.arrived_at ? ` (${r.arrived_at})` : ''}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div>
      <div className="assistant-card-title">{t('assistant.materialsFor', { name: a.project.name })}</div>
      <ul className="assistant-list">
        {a.items.map((it, i) => (
          <li key={i} className="assistant-pick" onClick={() => onPick?.(`${it.name}${it.qty ? ' ' + it.qty : ''}`)}>{it.name}{it.qty ? `: ${it.qty}${it.unit ? ' ' + it.unit : ''}` : ''}</li>
        ))}
      </ul>
    </div>
  )
}

export default function AssistantModal({ onClose }) {
  const { t, lang } = useT()
  const [messages, setMessages]   = useState(loadHistory)
  const [quota, setQuota]         = useState(null)
  const [headMenu, setHeadMenu]   = useState(false)
  const [sendWhenReady, setSendWhenReady] = useState(false)
  const [replyTo, setReplyTo]     = useState('')
  const [input, setInput]         = useState('')
  const [busy, setBusy]           = useState(false)
  const [err, setErr]             = useState('')
  const [listening, setListening] = useState(false)
  const [photos, setPhotos]     = useState([])
  const [menuOpen, setMenuOpen] = useState(false)
  const langRef = useRef(lang)
  const [prepping, setPrepping] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const segRef = useRef(null)
  const waveRef = useRef(null)
  const taRef = useRef(null)
  const camRef = useRef(null)
  const galRef = useRef(null)
  const recRef  = useRef(null)
  const baseRef = useRef('')
  const inputRef = useRef('')
  const wantRef = useRef(false)
  const logRef  = useRef(null)
  inputRef.current = input
  useEffect(() => { saveHistory(messages) }, [messages])
  useLayoutEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, Math.round(window.innerHeight * 0.4)) + 'px'
    el.scrollTop = el.scrollHeight
  }, [input])
  langRef.current = lang

  // The screen must not dim or lock while the user is talking
  useEffect(() => {
    if (!listening) return
    keepScreenAwake(true)
    return () => keepScreenAwake(false)
  }, [listening])

  // While the assistant is open the page behind is not laid out at all: opening the
  // keyboard resizes the view, and re-laying out a long project list on every
  // frame of that is what made tapping the field feel slow.
  useEffect(() => {
    document.body.classList.add('assistant-open')
    return () => document.body.classList.remove('assistant-open')
  }, [])

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => {
      window.removeEventListener('keydown', h)
      wantRef.current = false
      const seg = segRef.current
      if (seg) {
        clearInterval(seg.timer); seg.stopped = true; seg.ended = true
        if (seg.rec) { seg.rec.onstop = null; try { seg.rec.stop() } catch { /* already stopped */ } }
        seg.stream.getTracks().forEach(tr => tr.stop())
        seg.ctx?.close?.().catch?.(() => {})
      }
      try { recRef.current?.abort?.() } catch { /* already stopped */ }
    }
  }, [onClose])

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }) }, [messages, busy])

  const quotaPct = quota?.budget ? Math.round((quota.used / quota.budget) * 100) : 0

  const errText = (code, fallback = 'assistant.errUnavailable') => {
    if (code === 'busy') return t('assistant.errBusy')
    if (code === 'limit') return t('assistant.errLimit')
    if (code === 'trial_limit') return t('assistant.errTrialLimit')
    if (code === 'locked') return t('assistant.errLocked')
    if (code === 'network') return t('assistant.errNetwork')
    return t(fallback)
  }

  // The browser ends a recognition session after a short silence. Keep it
  // alive until the user taps stop (or sends), so pauses to think are fine.
  const startListening = () => {
    const rec = new SpeechRec()
    rec.lang = SPEECH_LANG[langRef.current] || 'en-US' // only the browser fallback needs a language
    rec.interimResults = true
    rec.continuous = true
    baseRef.current = inputRef.current
    rec.onresult = (e) => {
      const said = Array.from(e.results).map(r => r[0].transcript).join(' ').trim()
      setInput((baseRef.current ? baseRef.current + ' ' : '') + said)
    }
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        wantRef.current = false
        setErr(t('assistant.errMic'))
      }
    }
    rec.onend = () => {
      if (wantRef.current) setTimeout(() => { if (wantRef.current) startListening() }, 150)
      else setListening(false)
    }
    recRef.current = rec
    try { rec.start() } catch { wantRef.current = false; setListening(false) }
  }

  // Recording is cut into phrases at pauses (or every 20 s); each phrase is
  // transcribed as soon as it is cut, so the text appears while the user is
  // still talking instead of only after they stop.
  const enqueue = (s, blob) => { s.queue.push(blob); pump(s) }

  const pump = async (s) => {
    if (s.busy) return
    s.busy = true
    setTranscribing(true)
    while (s.queue.length) {
      const blob = s.queue.shift()
      try {
        const { text, quota: q } = await transcribeAudio(blob)
        if (q) setQuota(q)
        if (text) setInput(prev => (prev ? prev + ' ' : '') + text)
      } catch (e) {
        setErr(errText(e.message, 'assistant.errTranscribe'))
      }
    }
    s.busy = false
    setTranscribing(false)
  }

  const beginSegment = (s) => {
    const chunks = []
    const rec = new MediaRecorder(s.stream, s.mime ? { mimeType: s.mime } : undefined)
    rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data) }
    rec._chunks = chunks
    s.rec = rec
    s.segStart = Date.now()
    s.hadVoice = false
    rec.start()
  }

  const cutSegment = (s, final) => {
    const rec = s.rec
    // If the level meter gave no signal at all we cannot tell silence from speech: send it
    const voice = s.hadVoice || !s.sawSignal
    rec.onstop = () => {
      const blob = new Blob(rec._chunks, { type: rec.mimeType || s.mime || 'audio/mp4' })
      if (voice && blob.size >= 1500) enqueue(s, blob)
      if (final) {
        s.ended = true
        s.stream.getTracks().forEach(tr => tr.stop())
        s.ctx?.close?.().catch?.(() => {})
        if (!s.busy && !s.queue.length) setTranscribing(false)
      }
    }
    // The next recorder starts right away so no speech falls between two phrases
    if (!final) beginSegment(s)
    try { rec.stop() } catch { /* already stopped */ }
  }

  const startRecording = async (ctx) => {
    setErr('')
    let stream
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }) } catch { setErr(t('assistant.errMic')); ctx?.close?.(); return }
    warmUpTranscribe()
    const mime = pickMime()
    const s = { stream, ctx, mime, queue: [], busy: false, ended: false, sawSignal: false, hadVoice: false, lastVoice: 0, noise: 0.01, begun: Date.now() }
    let analyser = null
    try {
      analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      ctx.createMediaStreamSource(stream).connect(analyser)
    } catch { analyser = null }
    const level = analyser ? new Uint8Array(analyser.fftSize) : null
    try { beginSegment(s) } catch { stream.getTracks().forEach(tr => tr.stop()); setErr(t('assistant.errMic')); return }
    segRef.current = s
    setListening(true)
    s.timer = setInterval(() => {
      const now = Date.now()
      if (level) {
        analyser.getByteTimeDomainData(level)
        let sum = 0
        for (const v of level) { const x = (v - 128) / 128; sum += x * x }
        const rms = Math.sqrt(sum / level.length)
        if (rms > 0.0005) s.sawSignal = true
        waveRef.current?.style.setProperty('--lvl', String(Math.min(1, rms * 9)))
        if (now - s.begun < 600) s.noise = Math.max(s.noise, rms)
        if (rms > Math.max(0.02, s.noise * 2.5)) { s.hadVoice = true; s.lastVoice = now }
      }
      const len = now - s.segStart
      const paused = s.hadVoice && now - s.lastVoice > 450 && len > 1000
      const tooLong = len > (s.sawSignal ? 9000 : 8000)
      if (paused || tooLong) cutSegment(s, false)
      if (now - s.begun > MAX_RECORD_MS) stopListening()
    }, 100)
  }

  const stopListening = () => {
    wantRef.current = false
    const s = segRef.current
    if (s && !s.stopped) {
      s.stopped = true
      clearInterval(s.timer)
      setListening(false)
      setTranscribing(true) // the last phrase is still being converted; cleared when the queue is empty
      cutSegment(s, true)
      return
    }
    try { recRef.current?.stop() } catch { /* already stopped */ }
    if (!CAN_RECORD) setListening(false)
  }

  const toggleMic = () => {
    if (listening) { stopListening(); return }
    setErr('')
    if (CAN_RECORD) {
      // The audio context must be created inside the tap, or iOS keeps it muted
      let ctx = null
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); ctx.resume?.() } catch { ctx = null }
      segRef.current = null
      startRecording(ctx)
      return
    }
    wantRef.current = true
    setListening(true)
    startListening()
  }

  const addPhotos = async (fileList) => {
    const picked = Array.from(fileList || []).slice(0, Math.max(0, MAX_PHOTOS - photos.length))
    if (!picked.length) { setErr(t('assistant.maxPhotos')); return }
    setErr('')
    setPrepping(true)
    const added = []
    for (const f of picked) {
      try {
        // Same preparation as task photos: HEIC to JPEG, max 1200 px, compressed
        const { file } = await prepareImage(f)
        added.push({ id: Math.random().toString(36).slice(2), file, url: URL.createObjectURL(file), b64: await toBase64(file) })
      } catch { setErr(t('assistant.errPhoto')) }
    }
    setPhotos(p => [...p, ...added].slice(0, MAX_PHOTOS))
    setPrepping(false)
  }

  const removePhoto = (id) => setPhotos(p => p.filter(x => x.id !== id))

  // Send tapped while still recording: stop, let the last phrase finish converting, then send
  const onSendClick = () => {
    if (listening || transcribing) {
      if (!CAN_RECORD) { stopListening(); send(); return }
      setSendWhenReady(true)
      if (listening) stopListening()
      return
    }
    send()
  }

  useEffect(() => {
    if (sendWhenReady && !listening && !transcribing) {
      setSendWhenReady(false)
      send()
    }
  }, [sendWhenReady, listening, transcribing])

  const send = async () => {
    const text = input.trim()
    if ((!text && !photos.length) || busy || prepping || transcribing || (listening && CAN_RECORD)) return
    stopListening()
    setErr('')
    setInput('')
    setMenuOpen(false)
    const sent = photos
    setPhotos([])
    const content = text || t('assistant.photosOnly')
    const quote = replyTo
    setReplyTo('')
    const userMsg = { role: 'user', content, quote, photoUrls: sent.map(x => x.url), photoCount: sent.length }
    const next = [...messages, userMsg]
    setMessages(next)
    setBusy(true)
    try {
      const context = await buildContext()
      const last = [...messages].reverse().find(m => m.role === 'assistant')
      const hasDraft = !!last && ['pending', 'error'].includes(last.state)
      const { reply, actions, quota: q } = await askAssistant(next.map(toApi), context, sent.map(x => x.b64), hasDraft)
      if (q) setQuota(q)
      const normalized = actions.map(x => normalizeAction(x, sent.length)).filter(Boolean)
      if (!reply && !normalized.length) setErr(t('assistant.errNothing'))
      else setMessages(m => [
        // A new draft replaces any draft that was still waiting for an answer
        ...(normalized.length ? m.map(x => (x.state === 'pending' ? { ...x, state: 'replaced' } : x)) : m),
        {
          role: 'assistant', content: reply, actions: normalized, raw: actions, state: normalized.length ? 'pending' : null,
          photoFiles: sent.map(x => x.file), photoUrls: sent.map(x => x.url), photoCount: sent.length,
        },
      ])
    } catch (e) {
      setErr(errText(e.message))
    } finally {
      setBusy(false)
    }
  }

  const pickLine = (text) => { setReplyTo(text.slice(0, 160)); taRef.current?.focus() }

  const [copied, setCopied] = useState(-1)
  const copyText = async (i, text) => {
    try { await navigator.clipboard.writeText(text) } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch { /* nothing else to try */ }
      ta.remove()
    }
    setCopied(i)
    setTimeout(() => setCopied(c => (c === i ? -1 : c)), 1500)
  }

  const clearHistory = () => {
    if (!window.confirm(t('assistant.clearConfirm'))) return
    setMessages([])
    setReplyTo('')
  }

  const setState = (i, state, error = '') =>
    setMessages(m => m.map((x, j) => j === i ? { ...x, state, error } : x))

  const apply = async (i) => {
    setState(i, 'applying')
    for (const a of messages[i].actions) {
      const { error } = await applyAction(a, messages[i].photoFiles)
      if (error) {
        setState(i, 'error', error === 'locked' ? t('assistant.errLocked') : error?.message === 'upload' ? t('assistant.errUpload') : t('assistant.errSave'))
        return
      }
    }
    setState(i, 'applied')
  }

  return (
    <div className="assistant-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="assistant-sheet">
        <div className="assistant-head">
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 15 }}>
            <Sparkle size={18} weight="fill" style={{ color: 'var(--accent)' }} /> {t('assistant.title')}
          </span>
          {messages.length > 0 && (
            <span style={{ position: 'relative', marginLeft: 6 }}>
              <button className="assistant-x" onClick={() => setHeadMenu(o => !o)} aria-label={t('assistant.more')}><DotsThree size={20} weight="bold" /></button>
              {headMenu && (
                <div className="assistant-menu" style={{ top: 34, bottom: 'auto', left: 0 }}>
                  <button style={{ color: 'var(--danger)' }} onClick={() => { setHeadMenu(false); clearHistory() }}><Trash size={17} /> {t('assistant.clear')}</button>
                </div>
              )}
            </span>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: quotaPct >= 85 ? 'var(--danger)' : 'var(--text-secondary)' }}>
            {quotaPct >= 60 ? t('assistant.quota', { pct: Math.min(100, quotaPct) }) : ''}
          </span>
          <button className="assistant-x" onClick={onClose} aria-label={t('assistant.close')}><X size={18} weight="bold" /></button>
        </div>

        <div className="assistant-log" ref={logRef}>
          {messages.length === 0 && (
            <div className="assistant-hint">
              <div>{t('assistant.hint')}</div>
              {!CAN_RECORD && !SpeechRec && <div style={{ marginTop: 8 }}>{t('assistant.hintDictate')}</div>}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`assistant-msg ${m.role}`}>
              {m.quote && <div className="assistant-quote">{m.quote}</div>}
              {m.role === 'user' && m.photoUrls?.length > 0 && <Thumbs idx={m.photoUrls.map((_, k) => k)} photos={m.photoUrls} />}
              {m.role === 'user' && !m.photoUrls?.length && m.photoCount > 0 && (
                <div className="assistant-meta" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Images size={14} /> {m.photoCount}</div>
              )}
              {m.content && <div>{m.content}</div>}
              {m.actions?.map((a, k) => (
                <div key={k} className="assistant-card"><ActionPreview a={a} photos={m.photoUrls} onPick={pickLine} /></div>
              ))}
              {m.state === 'pending' && (
                <div className="assistant-btns">
                  <button className="btn btn-primary btn-sm" onClick={() => apply(i)}>{t('assistant.apply')}</button>
                  <button className="btn btn-sm" onClick={() => setState(i, 'cancelled')}>{t('assistant.cancel')}</button>
                </div>
              )}
              {m.state === 'applying' && <div className="assistant-status">…</div>}
              {m.state === 'applied' && <div className="assistant-status ok">{t('assistant.applied')}</div>}
              {m.state === 'cancelled' && <div className="assistant-status">{t('assistant.cancelled')}</div>}
              {m.state === 'replaced' && <div className="assistant-status">{t('assistant.replaced')}</div>}
              {m.state === 'expired' && <div className="assistant-status">{t('assistant.expired')}</div>}
              {m.actions?.length > 0 && <div className="assistant-meta" style={{ marginTop: 4 }}>{t('assistant.pickHint')}</div>}
              {m.content && (
                <div className="assistant-acts">
                  <button className="assistant-reply" onClick={() => pickLine(m.content)}>
                    <ArrowBendUpLeft size={13} weight="bold" /> {t('assistant.reply')}
                  </button>
                  <button className="assistant-reply" onClick={() => copyText(i, m.content)}>
                    <Copy size={13} weight="bold" /> {copied === i ? t('assistant.copied') : t('assistant.copy')}
                  </button>
                </div>
              )}
              {m.state === 'error' && (
                <div className="assistant-status bad">
                  {m.error}
                  <div className="assistant-btns"><button className="btn btn-sm" onClick={() => apply(i)}>{t('assistant.retry')}</button></div>
                </div>
              )}
            </div>
          ))}
          {busy && <div className="assistant-msg assistant"><span className="assistant-status">{t('assistant.thinking')}</span></div>}
          {err && <div className="assistant-err">{err}</div>}
        </div>

        {replyTo && (
          <div className="assistant-replying">
            <ArrowBendUpLeft size={14} weight="bold" style={{ flexShrink: 0 }} />
            <span>{replyTo}</span>
            <button onClick={() => setReplyTo('')} aria-label={t('assistant.removePhoto')}><X size={14} weight="bold" /></button>
          </div>
        )}

        {photos.length > 0 && (
          <div className="assistant-photos">
            {photos.map(p => (
              <div key={p.id} className="assistant-photo">
                <img src={p.url} alt="" />
                <button onClick={() => removePhoto(p.id)} aria-label={t('assistant.removePhoto')}><X size={12} weight="bold" /></button>
              </div>
            ))}
          </div>
        )}
        {(listening || transcribing || prepping) && (
          <div className="assistant-live">
            {listening && (
              <>
                <span className="assistant-rec-dot" />
                <span className={`assistant-wave${CAN_RECORD ? '' : ' fake'}`} ref={waveRef}><i /><i /><i /><i /><i /></span>
                <span>{t('assistant.recording')}</span>
              </>
            )}
            {(transcribing || prepping) && (
              <>
                <span className="assistant-dots"><i /><i /><i /></span>
                {!listening && <span>{transcribing ? t('assistant.transcribing') : ''}</span>}
              </>
            )}
          </div>
        )}

        <div className="assistant-input">
          <div style={{ position: 'relative' }}>
            <button className="assistant-mic" onClick={() => setMenuOpen(o => !o)} aria-label={t('assistant.attach')} disabled={photos.length >= MAX_PHOTOS}>
              <Paperclip size={20} weight="bold" />
            </button>
            {menuOpen && (
              <div className="assistant-menu">
                <button onClick={() => { setMenuOpen(false); camRef.current?.click() }}><Camera size={18} /> {t('assistant.camera')}</button>
                <button onClick={() => { setMenuOpen(false); galRef.current?.click() }}><Images size={18} /> {t('assistant.gallery')}</button>
              </div>
            )}
            <input ref={camRef} type="file" accept="image/*" capture="environment" hidden
              onChange={e => { addPhotos(e.target.files); e.target.value = '' }} />
            <input ref={galRef} type="file" accept="image/*" multiple hidden
              onChange={e => { addPhotos(e.target.files); e.target.value = '' }} />
          </div>
          {(CAN_RECORD || SpeechRec) && (
            <button
              className={`assistant-mic${listening ? ' on' : ''}`}
              onClick={toggleMic}
              aria-label={listening ? t('assistant.micStop') : t('assistant.mic')}
            ><Microphone size={20} weight={listening ? 'fill' : 'bold'} /></button>
          )}
          <textarea
            ref={taRef}
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder={t('assistant.placeholder')}
            maxLength={2000}
          />
          <button className="assistant-send" onClick={onSendClick} disabled={busy || prepping || sendWhenReady || (!listening && !transcribing && !input.trim() && !photos.length)} aria-label={t('assistant.send')}>
            <PaperPlaneTilt size={18} weight="fill" />
          </button>
        </div>
      </div>
    </div>
  )
}
