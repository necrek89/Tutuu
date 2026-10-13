import { useT, LANGUAGES } from '../i18n/useLanguage'
import translations from '../i18n/translations'
import { useSiteTheme } from './useSiteTheme'
import './landing.css'

// Step icons: what the user actually looks for on their screen
const STEP_ICONS = {
  safari: <><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></>,
  chrome: <><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="21.17" y1="8" x2="12" y2="8"/><line x1="3.95" y1="6.06" x2="8.54" y2="14"/><line x1="10.88" y1="21.94" x2="15.46" y2="14"/></>,
  share: <><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></>,
  menu: <><circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none"/></>,
  plus: <><rect x="3" y="3" width="18" height="18" rx="4"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></>,
  check: <><circle cx="12" cy="12" r="10"/><polyline points="8 12 11 15 16 9"/></>,
}

function StepIcon({ name }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {STEP_ICONS[name]}
    </svg>
  )
}

function Steps({ steps }) {
  return (
    <div>
      {steps.map((step, i) => (
        <div key={i} className="ld-inst-step">
          <span className="ld-inst-num">{i + 1}</span>
          <span className="ld-inst-txt">{step.text}</span>
          <span className="ld-inst-ic"><StepIcon name={step.icon} /></span>
        </div>
      ))}
    </div>
  )
}

export default function InstallPage() {
  const { lang, setLang } = useT()
  const { theme, toggleTheme } = useSiteTheme()
  const l = translations[lang]?.landing || translations.en.landing

  const iosSteps = [
    { icon: 'safari', text: l.ios1 },
    { icon: 'share',  text: l.ios2 },
    { icon: 'plus',   text: l.ios3 },
    { icon: 'check',  text: l.ios4 },
  ]
  const androidSteps = [
    { icon: 'chrome', text: l.and1 },
    { icon: 'menu',   text: l.and2 },
    { icon: 'plus',   text: l.and3 },
    { icon: 'check',  text: l.and4 },
  ]

  return (
    <div className="ldg">

      {/* ── NAV ── */}
      <nav className="ld-nav">
        <a className="ld-logo" href="/">tutuu<em>.</em></a>
        <div className="ld-nav-r">
          <button className="ld-theme-btn" onClick={toggleTheme} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
            {theme === 'dark'
              ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            }
          </button>
          <select className="ld-lang" value={lang} onChange={e => setLang(e.target.value)}>
            {LANGUAGES.map(lg => <option key={lg.code} value={lg.code}>{lg.label}</option>)}
          </select>
          <a className="ld-nav-link" href="/">{(translations[lang]?.common || translations.en.common).back}</a>
          <a className="ld-btn-nav" href="/app">{l.navStart}</a>
        </div>
      </nav>

      {/* ── GUIDE ── */}
      <div className="ld-inst">
        <div className="ld-eyebrow" style={{ marginBottom: 16 }}>
          <span className="ld-eyebrow-dot" />
          PWA
        </div>
        <h1 className="ld-inst-title">{l.instTitle}</h1>
        <p className="ld-inst-sub">{l.instSub}</p>

        <div className="ld-inst-grid">
          {/* iOS */}
          <div className="ld-inst-card">
            <div className="ld-inst-plat">
              <svg width="17" height="17" viewBox="0 0 814 1000" fill="currentColor">
                <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-37.5-155.5-127.4C46 790.7 0 663 0 541.8c0-207.5 135.4-317.3 269-317.3 70.1 0 128.4 46.4 172.5 46.4 42.8 0 109.9-49 192.5-49 30.9 0 110.8 2.6 168.1 83zM554.1 158.3c21.4-25.3 36.5-60.6 36.5-95.9 0-4.9-.3-9.9-1.1-14.1-34.6 1.3-75.7 23.1-100.3 51.5-19.8 22.2-38.2 57.2-38.2 93.1 0 5.5.9 11 1.3 12.8 2.2.4 5.8.6 9.3.6 31.3 0 70.6-21 92.5-47.9z"/>
              </svg>
              {l.instIos}
            </div>
            <Steps steps={iosSteps} />
          </div>

          {/* Android */}
          <div className="ld-inst-card">
            <div className="ld-inst-plat">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3.18 23.76c.37.21.8.25 1.21.1l12.44-7.19-2.8-2.8-10.85 9.89zM.49 1.4A1.55 1.55 0 0 0 .25 2.2v19.6c0 .28.08.54.24.77l.1.1 10.98-10.97v-.26L.59 1.3l-.1.1zM20.54 10.27l-2.94-1.7-3.08 3.08 3.08 3.08 2.97-1.72c.85-.49.85-1.28-.03-1.74zM4.39.14L16.83 7.33l-2.8 2.8L3.18.24C3.57.07 4.02.11 4.39.34z"/>
              </svg>
              {l.instAndroid}
            </div>
            <Steps steps={androidSteps} />
          </div>
        </div>

        <div className="ld-inst-note">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          {l.instNote}
        </div>

        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <a className="ld-btn-p" href="/app">{l.instCta}</a>
        </div>
      </div>
    </div>
  )
}
