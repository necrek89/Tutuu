import { StrictMode, useState, useEffect } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import LandingPage from './pages/LandingPage.jsx'
import InstallPage from './pages/InstallPage.jsx'
import { TermsPage, PrivacyPage, RefundPage } from './pages/LegalPage.jsx'
import PricingPage from './pages/PricingPage.jsx'
import { LANG_CODES } from './seo/siteMeta.js'

// Card magic glow — event delegation, works for dynamically added cards
document.addEventListener('mousemove', e => {
  const card = e.target.closest('.card, .card-glow')
  if (card) {
    const r = card.getBoundingClientRect()
    card.style.setProperty('--mouse-x', ((e.clientX - r.left) / r.width * 100) + '%')
    card.style.setProperty('--mouse-y', ((e.clientY - r.top) / r.height * 100) + '%')
  }
})

// "/es/" and "/es" are the same page.
const normalizePath = (p) => (p.length > 1 ? p.replace(/\/+$/, '') : p) || '/'

// The public site: "/" is the English landing, "/es", "/ru", ... are the
// language landings (all prerendered at build time). Everything under "/app"
// (and any unknown path) is the single-page app, exactly as before.
function landingLang(path) {
  if (path === '/') return 'en'
  const code = path.slice(1)
  return LANG_CODES.includes(code) ? code : null
}

function Router() {
  const [path, setPath] = useState(() => normalizePath(window.location.pathname))

  useEffect(() => {
    const onPop = () => setPath(normalizePath(window.location.pathname))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Expose navigate globally for use in App.jsx and LandingPage
  window.__navigate = (to) => {
    window.history.pushState({}, '', to)
    setPath(normalizePath(to))
  }

  const lang = landingLang(path)
  if (lang) return <LandingPage lang={lang} />
  if (path === '/install') return <InstallPage />
  if (path === '/terms') return <TermsPage />
  if (path === '/privacy') return <PrivacyPage />
  if (path === '/refund') return <RefundPage />
  if (path === '/pricing') return <PricingPage />
  return <App />
}

// Visitors who land on "/" are sent where they belong before anything renders:
//  - back from Google sign-in or a password-reset email (Supabase returns to the
//    site root with tokens in the URL): carry them into the app with the URL intact
//  - a saved or browser language other than English: that language's landing
// Crawlers and link-preview bots have neither, so they always get English at "/".
function redirectHome() {
  if (normalizePath(window.location.pathname) !== '/') return false
  const { search, hash } = window.location
  if (/(^|[#&])(access_token|refresh_token|error_description)=|type=(recovery|signup|invite|magiclink)/.test(hash) || /[?&]code=/.test(search)) {
    window.location.replace('/app' + search + hash)
    return true
  }
  let saved = null
  try { saved = localStorage.getItem('tutuu_lang') } catch { /* storage blocked */ }
  const browser = (navigator.language || 'en').slice(0, 2).toLowerCase()
  const lang = LANG_CODES.includes(saved) ? saved : (LANG_CODES.includes(browser) ? browser : 'en')
  if (lang !== 'en') {
    window.location.replace('/' + lang + search + hash)
    return true
  }
  return false
}

if (!redirectHome()) {
  const rootEl = document.getElementById('root')
  const tree = (
    <StrictMode>
      <Router />
    </StrictMode>
  )
  // Public pages arrive with their HTML already in #root (see
  // scripts/prerender.mjs): attach to it instead of rebuilding it.
  if (rootEl.hasAttribute('data-prerendered')) hydrateRoot(rootEl, tree)
  else createRoot(rootEl).render(tree)
}
