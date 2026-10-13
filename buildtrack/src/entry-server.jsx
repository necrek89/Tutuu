// Build-time entry for the prerender (scripts/prerender.mjs). It renders the
// public pages to HTML strings; it is never shipped to the browser. Only
// import things here that are safe to run in Node (no store, no Supabase).
import { renderToString } from 'react-dom/server'
import LandingPage from './pages/LandingPage'
import PricingPage from './pages/PricingPage'
import InstallPage from './pages/InstallPage'
import { TermsPage, PrivacyPage, RefundPage } from './pages/LegalPage'

export function renderLanding(lang) {
  return renderToString(<LandingPage lang={lang} />)
}

const STATIC = {
  '/pricing': PricingPage,
  '/install': InstallPage,
  '/terms': TermsPage,
  '/privacy': PrivacyPage,
  '/refund': RefundPage,
}

export function renderStatic(path) {
  const Page = STATIC[path]
  if (!Page) throw new Error(`No prerender component for ${path}`)
  return renderToString(<Page />)
}
