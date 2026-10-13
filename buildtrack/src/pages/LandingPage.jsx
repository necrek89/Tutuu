import { useState, useEffect, useRef } from 'react'
import { useLang, LANGUAGES } from '../i18n/useLanguage'
import translations from '../i18n/translations'
import { landingPath } from '../seo/siteMeta'
import { useSiteTheme } from './useSiteTheme'
import './landing.css'

// The landing is prerendered at build time (scripts/prerender.mjs), so this file
// must stay free of browser-only work at render time and must not import the
// app store or the Supabase client at module level. Browser things happen in
// effects; the live-stats client is loaded lazily.

// ── Inline stroke icons (marquee + bento + mockup nav) ───────────────────────
const ICONS = {
  clipboard: <><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/></>,
  tool: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
  calc: <><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h4"/></>,
  box: <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>,
  camera: <><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></>,
  invoice: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></>,
  clock: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  user: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></>,
  chevronLeft:  <polyline points="15 18 9 12 15 6"/>,
  chevronRight: <polyline points="9 18 15 12 9 6"/>,
  close:        <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
}

function Ic({ name, size = 15, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name]}
    </svg>
  )
}

// ── Hero H1 with word-by-word blur reveal ────────────────────────────────────
function AnimatedH1({ line1, line2 }) {
  let i = 0
  const word = (text, orange) => (
    <span key={`${text}-${i}`} className="w" style={{ animationDelay: `${0.1 + (i++) * 0.1}s`, color: orange ? 'var(--ld-orange)' : undefined }}>
      {text}&nbsp;
    </span>
  )
  return (
    <h1 className="ld-h1">
      {line1.split(' ').map(w => word(w, false))}
      <br />
      {line2.split(' ').map(w => word(w, true))}
    </h1>
  )
}

// ── Animated number ticker ───────────────────────────────────────────────────
function Ticker({ items }) {
  const refs = useRef([])
  useEffect(() => {
    const rafs = []
    items.forEach((item, i) => {
      const el = refs.current[i]
      if (!el) return
      const start = performance.now() + 800 + i * 200
      const tick = (now) => {
        const p = Math.min(Math.max((now - start) / 2000, 0), 1)
        const ease = 1 - Math.pow(1 - p, 3)
        el.textContent = Math.round(item.target * ease).toLocaleString()
        if (p < 1) rafs[i] = requestAnimationFrame(tick)
      }
      rafs[i] = requestAnimationFrame(tick)
    })
    return () => rafs.forEach(r => cancelAnimationFrame(r))
  }, [])
  return (
    <div className="ld-ticker">
      {items.map((item, i) => (
        <div key={i}>
          <div className="ld-tick-num" ref={el => refs.current[i] = el}>0</div>
          <div className="ld-tick-label">{item.label}</div>
        </div>
      ))}
    </div>
  )
}

// ── Phone mockups ────────────────────────────────────────────────────────────
// Screens replicate the real app UI (project view) at native 320px scale,
// shrunk via transform:scale in CSS. All demo copy is intentionally English.
function PhoneFrame({ secondary, onClick, children }) {
  return (
    <div
      className={`ld-phone ${secondary ? 'secondary' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e => { if (e.key === 'Enter' || e.key === ' ') onClick() }) : undefined}
    >
      <div className="ld-cam" />
      <div className="ld-clip">{children}</div>
    </div>
  )
}

function MStatus() {
  return (
    <div className="m-status">
      <span>9:41</span>
      <span className="ic">
        <svg width="14" height="10" viewBox="0 0 14 10" fill="currentColor"><rect x="0" y="6" width="2.5" height="4" rx="0.8"/><rect x="3.7" y="4" width="2.5" height="6" rx="0.8"/><rect x="7.4" y="2" width="2.5" height="8" rx="0.8"/><rect x="11.1" y="0" width="2.5" height="10" rx="0.8"/></svg>
        <svg width="13" height="10" viewBox="0 0 24 18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M2 6a15 15 0 0 1 20 0"/><path d="M6 10.5a9.5 9.5 0 0 1 12 0"/><path d="M10 15a3.5 3.5 0 0 1 4 0"/></svg>
        <svg width="18" height="10" viewBox="0 0 25 12" fill="none" stroke="currentColor"><rect x="0.5" y="0.5" width="21" height="11" rx="3"/><rect x="2.5" y="2.5" width="12" height="7" rx="1.5" fill="currentColor" stroke="none"/><path d="M23.5 4v4" strokeWidth="1.6" strokeLinecap="round"/></svg>
      </span>
    </div>
  )
}

function MTopbar() {
  return (
    <div className="m-topbar">
      <svg width="14" height="11" viewBox="0 0 14 11" fill="none" stroke="#1C1917" strokeWidth="1.6" strokeLinecap="round"><path d="M1 1.5h12M1 5.5h12M1 9.5h12"/></svg>
      <span className="m-logo">tutuu<em>.</em></span>
      <span className="m-top-r">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <span className="m-uname">John Smith</span>
        <span className="m-uav">JS</span>
      </span>
    </div>
  )
}

function MProjHeader({ tabs, active }) {
  return (
    <>
      <div className="m-projrow">
        <span className="m-chip-back">← Back</span>
        <span className="m-ptitle">Oak Street 89</span>
        <span className="m-chip-invoice">Generate Invoice</span>
      </div>
      <div className="m-pbar"><div className="m-pbar-f" /></div>
      <div className="m-tabs">
        {tabs.map(t => <div key={t} className={`m-tab ${t === active ? 'on' : ''}`}>{t}</div>)}
      </div>
    </>
  )
}

function MStats() {
  return (
    <div className="m-stats">
      <div className="m-stat"><div className="m-stat-v orange">8%</div><div className="m-stat-l">Progress</div></div>
      <div className="m-stat"><div className="m-stat-v">2</div><div className="m-stat-l">Workers</div></div>
      <div className="m-stat"><div className="m-stat-v orange">0d</div><div className="m-stat-l">Days left</div></div>
      <div className="m-stat"><div className="m-stat-v">1/13</div><div className="m-stat-l">Tasks</div></div>
    </div>
  )
}

function MNav() {
  const items = [
    { icon: 'grid', label: 'Projects', on: true },
    { icon: 'box',  label: 'Materials' },
    { icon: 'tool', label: 'Tools' },
    { icon: 'user', label: 'Team' },
  ]
  return (
    <div className="m-nav">
      {items.map((item, i) => (
        <div key={i} className={`m-ni ${item.on ? 'on' : ''}`}>
          <Ic name={item.icon} size={17} />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  )
}

const DRAG_DOTS = (
  <svg width="7" height="11" viewBox="0 0 7 11" fill="currentColor"><circle cx="1.5" cy="1.5" r="1.2"/><circle cx="5.5" cy="1.5" r="1.2"/><circle cx="1.5" cy="5.5" r="1.2"/><circle cx="5.5" cy="5.5" r="1.2"/><circle cx="1.5" cy="9.5" r="1.2"/><circle cx="5.5" cy="9.5" r="1.2"/></svg>
)

function MTasksScreen() {
  const stages = [
    { n: 1, name: 'Panoramic window', count: '1/4', prog: 25 },
    { n: 2, name: 'Tiling',           count: '0/2', prog: 0 },
    { n: 3, name: 'Cleanup',          count: '0/0', prog: 0 },
    { n: 4, name: 'Facade',           count: '0/1', prog: 0 },
  ]
  return (
    <div className="mscr">
      <MStatus />
      <MTopbar />
      <MProjHeader tabs={['Tasks', 'Materials', 'Expenses', 'Photos', 'Documents']} active="Tasks" />
      <MStats />
      <div className="m-controls">
        <span className="m-chip-export">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export ▾
        </span>
        <span className="m-btn-accent">+ Task</span>
      </div>
      <div className="m-filters">
        <span className="m-fchip on">All (13)</span>
        <span className="m-fchip">Active</span>
        <span className="m-fchip">In Review (0)</span>
        <span className="m-fchip">Done</span>
      </div>
      <div className="m-cards">
        {stages.map(s => (
          <div key={s.n} className="m-card">
            <div className="m-crow">
              <span className="m-drag">{DRAG_DOTS}</span>
              <span className="m-num">{s.n}</span>
              <span className="m-cname">{s.name}</span>
              <span className="m-ccount">{s.count}</span>
              <span className="m-cicons">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </span>
            </div>
            <div className="m-cbar"><div className="m-cbar-f" style={{ width: `${s.prog}%` }} /></div>
          </div>
        ))}
        <div className="m-addstage">+ Add stage</div>
      </div>
      <MNav />
    </div>
  )
}

function MMaterialsScreen() {
  const items = [
    { name: 'Gloves × 10 pcs' },
    { name: 'Paint roller × 4 pcs' },
    { name: 'White bags × 20 pcs' },
  ]
  return (
    <div className="mscr">
      <MStatus />
      <MTopbar />
      <MProjHeader tabs={['Tasks', 'Materials', 'Expenses', 'Photos', 'Documents']} active="Materials" />
      <MStats />
      <div className="m-controls" style={{ justifyContent: 'flex-end' }}>
        <span className="m-btn-accent">+ Report shortage</span>
      </div>
      <div className="m-statcards">
        <div className="m-statcard red"><div className="v">0</div><div className="t">Open shortages</div></div>
        <div className="m-statcard green"><div className="v">1</div><div className="t">Purchased this week</div></div>
      </div>
      <div className="m-filters">
        <span className="m-fchip on">All (12)</span>
        <span className="m-fchip">Open (0)</span>
        <span className="m-fchip">Purchased</span>
      </div>
      <div className="m-mrows">
        {items.map((item, i) => (
          <div key={i} className="m-mrow">
            <span className="m-mcheck">✓</span>
            <span style={{ flex: 1 }}>
              <div className="m-mname">{item.name}</div>
              <div className="m-msub">John Smith · <span className="g">purchased May 28</span></div>
            </span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#B8AFA3" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </div>
        ))}
      </div>
      <MNav />
    </div>
  )
}

function MTeamScreen() {
  const members = [
    { av: 'T', name: 'Tom Walker', role: 'worker' },
    { av: 'E', name: 'Emma Davis', role: 'worker' },
    { av: 'A', name: 'Alex Brown', role: 'worker' },
  ]
  return (
    <div className="mscr">
      <MStatus />
      <MTopbar />
      <MProjHeader tabs={['Materials', 'Expenses', 'Photos', 'Documents', 'Team']} active="Team" />
      <MStats />
      <div className="m-trows">
        {members.map((m, i) => (
          <div key={i} className="m-trow">
            <span className="m-tav">{m.av}</span>
            <span>
              <div className="m-tname">{m.name}</div>
              <div className="m-trole">{m.role}</div>
            </span>
            <span className="m-badge">Active</span>
          </div>
        ))}
      </div>
      <MNav />
    </div>
  )
}

// ── Mockup lightbox: click a phone to see it full-size, arrow/swipe between
// screens. The mockup content itself is hand-built markup at a fixed 320×666
// canvas (not an <img>), so "zooming in" means re-rendering it at a bigger
// scale rather than opening an image file. Scale is measured from the actual
// rendered clip width via ResizeObserver, so it stays correct at any phone
// or desktop viewport instead of relying on fixed CSS breakpoints. ──────────
// Real PNG captures of each screen (see public/mockups/) — a plain <img>
// scales via ordinary CSS (width + height:auto), the same everywhere,
// which sidesteps the whole class of bug the live CSS-mockup rendering
// kept running into (a double-nested .mscr div meant a computed JS scale
// was being applied to an empty wrapper while the actual content stayed
// at its default tiny size — that was the real, reproducible-anywhere
// root cause, not a Safari-only quirk).
function MockupLightbox({ screens, startIndex, onClose }) {
  const [idx, setIdx] = useState(startIndex)
  const touchX = useRef(null)

  const count = screens.length
  const goPrev = () => setIdx(i => (i - 1 + count) % count)
  const goNext = () => setIdx(i => (i + 1) % count)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape')     onClose()
      if (e.key === 'ArrowRight') goNext()
      if (e.key === 'ArrowLeft')  goPrev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count])

  const onTouchStart = (e) => { touchX.current = e.touches[0].clientX }
  const onTouchEnd = (e) => {
    if (touchX.current == null) return
    const dx = e.changedTouches[0].clientX - touchX.current
    if (dx > 40) goPrev()
    else if (dx < -40) goNext()
    touchX.current = null
  }

  const screen = screens[idx]

  return (
    <div className="ld-lb-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <button className="ld-lb-close" onClick={onClose} aria-label="Close"><Ic name="close" size={18} color="#fff" /></button>

      <button className="ld-lb-arrow left" onClick={goPrev} aria-label="Previous screen">
        <Ic name="chevronLeft" size={22} color="#fff" />
      </button>

      <div className="ld-lb-phone" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="ld-cam" />
        <div className="ld-lb-clip">
          <img src={screen.src} alt={screen.alt} className="ld-lb-img" draggable="false" />
        </div>
      </div>

      <button className="ld-lb-arrow right" onClick={goNext} aria-label="Next screen">
        <Ic name="chevronRight" size={22} color="#fff" />
      </button>

      <div className="ld-lb-dots">
        {screens.map((_, i) => (
          <button key={i} className={`ld-lb-dot ${i === idx ? 'on' : ''}`} onClick={() => setIdx(i)} aria-label={`Screen ${i + 1}`} />
        ))}
      </div>
    </div>
  )
}

// Crew counter: grows by one per day, capped at 300.
const CREW_START = Date.UTC(2026, 5, 1) // Jun 1, 2026
const CREW_BASE = 220
function crewCount(now = Date.now()) {
  const days = Math.max(0, Math.floor((now - CREW_START) / 86400000))
  return Math.min(300, CREW_BASE + days)
}
// Same value on the server and in the browser's first render (both are built
// the same day), so hydration matches; the real day count is applied on mount.
// eslint-disable-next-line no-undef
const BUILD_DAY = typeof __BUILD_DAY__ !== 'undefined' ? __BUILD_DAY__ : null
const buildTimeCrew = () => crewCount(BUILD_DAY ? Date.parse(BUILD_DAY) : Date.now())

// ── MAIN LANDING PAGE ────────────────────────────────────────────────────────
export default function LandingPage({ lang: langProp }) {
  const storeLang = useLang(s => s.lang)
  const lang = langProp || storeLang
  const l = translations[lang]?.landing || translations.en.landing
  const [stats, setStats] = useState(null)
  const [crew, setCrew] = useState(buildTimeCrew)
  const { theme, toggleTheme } = useSiteTheme()
  const [lightboxIdx, setLightboxIdx] = useState(null)
  // Same order as rendered in .ld-phones below — real PNG captures of each
  // screen, see public/mockups/
  const mockupScreens = [
    { src: '/mockups/materials.png', alt: 'Materials screen' },
    { src: '/mockups/tasks.png',     alt: 'Tasks screen' },
    { src: '/mockups/team.png',      alt: 'Team screen' },
  ]

  // Real aggregate numbers from the DB (landing_stats RPC, anon-accessible).
  // The ticker is only rendered once real data arrives.
  useEffect(() => {
    let cancelled = false
    import('../lib/supabase').then(({ supabase }) =>
      supabase.rpc('landing_stats').then(({ data, error }) => {
        if (cancelled || error || !data) return
        setStats(data)
      })
    ).catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Browser-only state, applied after the first (prerendered) render.
  useEffect(() => {
    setCrew(crewCount())
    document.documentElement.lang = lang
    // Opening a language URL such as /es counts as choosing that language, so
    // the app opened from here speaks it too. English is the default and is
    // only stored when picked explicitly in the selector.
    if (langProp && langProp !== 'en') {
      try { localStorage.setItem('tutuu_lang', langProp) } catch { /* storage blocked */ }
      useLang.setState({ lang: langProp })
    }
  }, [lang, langProp])

  // Language pages are real URLs (/es, /ru, ...): picking one saves the choice
  // and goes there.
  const goToLanguage = (code) => {
    try { localStorage.setItem('tutuu_lang', code) } catch { /* storage blocked */ }
    window.location.assign(landingPath(code))
  }
  const langPickRef = useRef(null)
  useEffect(() => {
    const close = (e) => {
      const el = langPickRef.current
      if (el?.open && (e.type === 'keydown' ? e.key === 'Escape' : !el.contains(e.target))) el.open = false
    }
    document.addEventListener('click', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', close) }
  }, [])
  const scrollToFeatures = (e) => {
    e.preventDefault()
    document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })
  }

  const onCardMove = (e) => {
    const card = e.currentTarget
    const r = card.getBoundingClientRect()
    card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%')
    card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%')
  }

  const marquee = [
    { icon: 'clipboard', label: l.mq1 },
    { icon: 'tool',      label: l.mq2 },
    { icon: 'users',     label: l.mq3 },
    { icon: 'calc',      label: l.mq4 },
    { icon: 'box',       label: l.mq5 },
    { icon: 'camera',    label: l.mq6 },
    { icon: 'invoice',   label: l.mq7 },
    { icon: 'clock',     label: l.mq8 },
  ]

  const avatars = [
    { txt: 'JS', color: '#3B82F6' },
    { txt: 'AK', color: '#10B981' },
    { txt: 'MP', color: '#8B5CF6' },
    { txt: 'TW', color: '#F59E0B' },
    { txt: '+',  color: '#EF4444' },
  ]

  return (
    <div className="ldg">

      {/* ── NAV ── */}
      <nav className="ld-nav">
        <div className="ld-logo">tutuu<em>.</em></div>
        <div className="ld-nav-r">
          <button className="ld-theme-btn" onClick={toggleTheme} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
            {theme === 'dark'
              ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            }
          </button>
          <select className="ld-lang" value={lang} onChange={e => goToLanguage(e.target.value)} aria-label="Language">
            {LANGUAGES.map(lg => <option key={lg.code} value={lg.code}>{lg.label}</option>)}
          </select>
          <a className="ld-nav-link" href="/app">{l.navSignin}</a>
          <a className="ld-btn-nav" href="/app">{l.navStart}</a>
        </div>
      </nav>

      {/* ── HERO ── */}
      <div className="ld-hero">
        <div className="ld-dots" />
        <div className="ld-hero-content">
          <div className="ld-eyebrow">
            <span className="ld-eyebrow-dot" />
            {l.eyebrow}
          </div>

          <AnimatedH1 line1={l.h1_1} line2={l.h1_2} />

          <p className="ld-sub">{l.sub}</p>

          <div className="ld-btns">
            <a className="ld-btn-p" href="/app">{l.ctaHero}</a>
            <a className="ld-btn-s" href="#features" onClick={scrollToFeatures}>{l.how}</a>
          </div>

          {/* Social proof */}
          <div className="ld-avatars">
            {avatars.map((a, i) => (
              <div key={i} className="ld-av" style={{ background: a.color }}>{a.txt}</div>
            ))}
            <span className="ld-av-label">{l.join1} <strong>{crew}+ {l.join2}</strong></span>
          </div>

          {/* Number ticker — live counts from the DB */}
          {stats && (
            <Ticker items={[
              { target: stats.tasks    ?? 0, label: l.tick1 },
              { target: stats.workers  ?? 0, label: l.tick2 },
              { target: stats.projects ?? 0, label: l.tick3 },
            ]} />
          )}

          {/* Platforms */}
          <div className="ld-platforms">
            <a className="ld-plat click" href="/install" title="How to install">
              <span className="ic">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
              </span>
              Web <span className="ld-plat-live">{l.platLive}</span>
            </a>
            <div className="ld-plat">
              <span className="ic">
                <svg width="14" height="14" viewBox="0 0 814 1000" fill="currentColor">
                  <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-37.5-155.5-127.4C46 790.7 0 663 0 541.8c0-207.5 135.4-317.3 269-317.3 70.1 0 128.4 46.4 172.5 46.4 42.8 0 109.9-49 192.5-49 30.9 0 110.8 2.6 168.1 83zM554.1 158.3c21.4-25.3 36.5-60.6 36.5-95.9 0-4.9-.3-9.9-1.1-14.1-34.6 1.3-75.7 23.1-100.3 51.5-19.8 22.2-38.2 57.2-38.2 93.1 0 5.5.9 11 1.3 12.8 2.2.4 5.8.6 9.3.6 31.3 0 70.6-21 92.5-47.9z"/>
                </svg>
              </span>
              App Store <span className="ld-plat-soon">{l.platSoon}</span>
            </div>
            <div className="ld-plat">
              <span className="ic">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3.18 23.76c.37.21.8.25 1.21.1l12.44-7.19-2.8-2.8-10.85 9.89zM.49 1.4A1.55 1.55 0 0 0 .25 2.2v19.6c0 .28.08.54.24.77l.1.1 10.98-10.97v-.26L.59 1.3l-.1.1zM20.54 10.27l-2.94-1.7-3.08 3.08 3.08 3.08 2.97-1.72c.85-.49.85-1.28-.03-1.74zM4.39.14L16.83 7.33l-2.8 2.8L3.18.24C3.57.07 4.02.11 4.39.34z"/>
                </svg>
              </span>
              Google Play <span className="ld-plat-soon">{l.platSoon}</span>
            </div>
          </div>

          {/* Phone mockups */}
          <div className="ld-phones">
            <PhoneFrame secondary onClick={() => setLightboxIdx(0)}><MMaterialsScreen /></PhoneFrame>
            <PhoneFrame onClick={() => setLightboxIdx(1)}><MTasksScreen /></PhoneFrame>
            <PhoneFrame secondary onClick={() => setLightboxIdx(2)}><MTeamScreen /></PhoneFrame>
          </div>
        </div>
      </div>

      {/* ── MARQUEE ── */}
      <div className="ld-marquee">
        <div className="ld-marquee-track">
          {[...marquee, ...marquee].map((item, i) => (
            <div key={i} className="ld-mq-item">
              <span className="ic"><Ic name={item.icon} /></span>
              {item.label}
            </div>
          ))}
        </div>
      </div>

      {/* ── BENTO GRID ── */}
      <div className="ld-bento-section" id="features">
        <div className="ld-sec-eyebrow">{l.featLbl}</div>
        <h2 className="ld-sec-title">{l.bentoTitle}</h2>
        <div className="ld-bento">

          <div className="ld-card featured" onMouseMove={onCardMove}>
            <div className="ld-card-icon"><Ic name="clipboard" />{l.bl1}</div>
            <div className="ld-card-title">{l.f1t}</div>
            <div className="ld-card-desc">{l.f1d}</div>
            <div className="ld-mini">
              <div className="ld-mini-row">
                <div className="ld-mini-dot" style={{ background: 'var(--ld-orange)' }} />
                <span className="ld-mini-name">{l.scrTask1}</span>
                <span className="ld-mini-status" style={{ background: '#DCFCE7', color: '#16A34A' }}>{l.stDone}</span>
              </div>
              <div className="ld-mini-row">
                <div className="ld-mini-dot" style={{ background: '#F59E0B' }} />
                <span className="ld-mini-name">{l.scrTask3}</span>
                <span className="ld-mini-status" style={{ background: '#FEF9C3', color: '#CA8A04' }}>{l.stInProg}</span>
              </div>
              <div className="ld-mini-row">
                <div className="ld-mini-dot" style={{ background: 'var(--ld-border)' }} />
                <span className="ld-mini-name">{l.scrTask2}</span>
                <span className="ld-mini-status" style={{ background: 'var(--ld-sand)', color: 'var(--ld-muted)' }}>{l.stTodo}</span>
              </div>
            </div>
          </div>

          <div className="ld-card tall" onMouseMove={onCardMove}>
            <div className="ld-card-icon"><Ic name="calc" />{l.bl2}</div>
            <div className="ld-card-title">{l.f3t}</div>
            <div className="ld-card-desc">{l.f3d}</div>
            <div className="ld-mini" style={{ marginTop: 16 }}>
              {[
                { initials: 'AF', color: '#EA580C', name: 'Aleksei', shifts: 12, sum: '€540' },
                { initials: 'IS', color: '#6366F1', name: 'Ivan',    shifts: 10, sum: '€450' },
                { initials: 'MK', color: '#0891B2', name: 'Maxim',   shifts: 8,  sum: '€400' },
              ].map((w, i) => (
                <div key={i} className="ld-mini-row">
                  <div className="ld-mini-mav" style={{ background: w.color }}>{w.initials}</div>
                  <span className="ld-mini-name">{w.name} · {w.shifts} {l.shiftsWord}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ld-orange)' }}>{w.sum}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="ld-card" onMouseMove={onCardMove}>
            <div className="ld-card-icon"><Ic name="box" />{l.bl3}</div>
            <div className="ld-card-title">{l.f2t}</div>
            <div className="ld-card-desc">{l.f2d}</div>
          </div>

          <div className="ld-card" onMouseMove={onCardMove}>
            <div className="ld-card-icon"><Ic name="tool" />{l.bl4}</div>
            <div className="ld-card-title">{l.f4t}</div>
            <div className="ld-card-desc">{l.f4d}</div>
          </div>

          <div className="ld-card" onMouseMove={onCardMove}>
            <div className="ld-card-icon"><Ic name="invoice" />{l.bl5}</div>
            <div className="ld-card-title">{l.f6t}</div>
            <div className="ld-card-desc">{l.f6d}</div>
          </div>

          <div className="ld-card" onMouseMove={onCardMove}>
            <div className="ld-card-icon"><Ic name="camera" />{l.bl6}</div>
            <div className="ld-card-title">{l.f5t}</div>
            <div className="ld-card-desc">{l.f5d}</div>
          </div>

        </div>
      </div>

      {/* ── STEPS ── */}
      <div className="ld-steps">
        <h2 className="ld-sec-title">{l.stepsTitle}</h2>
        <div className="ld-steps-row">
          {[
            { n: '1', t: l.s1t, d: l.s1d, line: true },
            { n: '2', t: l.s2t, d: l.s2d, line: true },
            { n: '3', t: l.s3t, d: l.s3d, line: false },
          ].map((step, i) => (
            <div key={i} className="ld-step">
              <div className="ld-step-num">{step.n}</div>
              <div className="ld-step-t">{step.t}</div>
              <div className="ld-step-d">{step.d}</div>
              {step.line && <div className="ld-step-line" />}
            </div>
          ))}
        </div>
      </div>

      {/* ── CTA ── */}
      <div className="ld-cta">
        <h2 className="ld-cta-title">{l.ctaT1}<br /><em>{l.ctaT2}</em></h2>
        <p className="ld-cta-sub">{l.ctaS}</p>
        <a className="ld-cta-btn" href="/app">{l.ctaB}</a>
      </div>

      {/* ── FOOTER ── */}
      <footer className="ld-footer">
        <div className="ld-logo" style={{ fontSize: 15 }}>tutuu<em>.</em></div>
        <div className="ld-footer-links">
          <a href="#features" onClick={scrollToFeatures}>{l.ftFeat}</a>
          <a href="/pricing">{l.ftPrice}</a>
          <a href="/app">{l.ftSignin}</a>
          <a href="/terms">Terms</a>
          <a href="/privacy">Privacy</a>
          <a href="/refund">Refunds</a>
        </div>
        {/* One compact control instead of nine loose links. The links stay in the
            HTML (a closed <details> is still readable by crawlers), so every
            language page is reachable without JavaScript. */}
        <details className="ld-langpick" ref={langPickRef}>
          <summary aria-label="Language">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            {LANGUAGES.find(lg => lg.code === lang)?.label}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </summary>
          <div className="ld-langpick-menu">
            {LANGUAGES.map(lg => (
              <a key={lg.code} href={landingPath(lg.code)} hrefLang={lg.code} lang={lg.code}
                 className={lg.code === lang ? 'on' : undefined}
                 onClick={() => { try { localStorage.setItem('tutuu_lang', lg.code) } catch { /* storage blocked */ } }}>{lg.label}</a>
            ))}
          </div>
        </details>
        <div>© 2026 Tutuu</div>
      </footer>

      {lightboxIdx !== null && (
        <MockupLightbox screens={mockupScreens} startIndex={lightboxIdx} onClose={() => setLightboxIdx(null)} />
      )}
    </div>
  )
}
