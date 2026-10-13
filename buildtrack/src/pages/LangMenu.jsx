import { useEffect, useRef } from 'react'
import { LANGUAGES } from '../i18n/useLanguage'
import { landingPath } from '../seo/siteMeta'

// The one language switcher on the public landing. People get a compact
// dropdown; crawlers and AI bots get real links to every language page (a closed
// <details> is still plain HTML), so nothing needs JavaScript to be found.
export default function LangMenu({ lang }) {
  const ref = useRef(null)

  // Close on a click elsewhere or Escape.
  useEffect(() => {
    const close = (e) => {
      const el = ref.current
      if (!el?.open) return
      if (e.type === 'keydown' ? e.key === 'Escape' : !el.contains(e.target)) el.open = false
    }
    document.addEventListener('click', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', close) }
  }, [])

  const current = LANGUAGES.find(lg => lg.code === lang)

  return (
    <details className="ld-langpick" ref={ref}>
      <summary aria-label="Language">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        <span className="ld-langpick-label">{current?.label}</span>
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
  )
}
