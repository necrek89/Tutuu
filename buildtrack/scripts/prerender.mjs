// Build step: turns the single-page app build into real HTML pages.
//
//   dist/index.html            English landing (what "/" serves)
//   dist/<lang>/index.html     the landing in every language (en, ru, sr, ...)
//   dist/<page>/index.html     /pricing /install /terms /privacy /refund
//   dist/app/index.html        the untouched single-page app shell (noindex)
//   dist/sitemap.xml           every public URL, with hreflang alternates
//
// Run it after `vite build` and `vite build --ssr src/entry-server.jsx --outDir dist-ssr`
// (npm run build does both). It reads dist/index.html (the app shell Vite built,
// with the hashed script and style tags) as the template, so every page loads
// the same bundle and the app keeps working exactly as before.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { SITE_URL, LANG_CODES, OG_LOCALE, SEO, STATIC_PAGES, landingUrl } from '../src/seo/siteMeta.js'
import { PLANS } from '../src/lib/plans.js'
import { checkDist } from './check-seo.mjs'

const root = path.resolve(import.meta.dirname, '..')
const dist = path.join(root, 'dist')
const ssrEntry = path.join(root, 'dist-ssr', 'entry-server.js')

const template = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')
if (!template.includes('<!--app-head-->')) throw new Error('index.html is missing the <!--app-head--> marker')
const { renderLanding, renderStatic } = await import(pathToFileURL(ssrEntry).href)

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const OG_IMAGE = `${SITE_URL}/og-image.png`

function page({ lang, head, body }) {
  let html = template
    .replace(/<html lang="[^"]*"/, `<html lang="${lang}"`)
    .replace(/<title>[\s\S]*?<\/title>\s*/, '')
    .replace('<!--app-head-->', head)
  html = html.replace('<div id="root"></div>', body == null ? '<div id="root"></div>' : `<div id="root" data-prerendered="1">${body}</div>`)
  if (body != null && !html.includes('data-prerendered')) throw new Error('could not place the prerendered markup')
  return html
}

function write(urlPath, html) {
  const file = urlPath === '/' ? path.join(dist, 'index.html') : path.join(dist, urlPath, 'index.html')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, html)
}

function jsonLd(lang) {
  const meta = SEO[lang]
  return JSON.stringify([
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Tutuu',
      url: landingUrl(lang),
      description: meta.description,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web (any phone or computer)',
      inLanguage: lang,
      image: OG_IMAGE,
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: 'USD',
        lowPrice: PLANS.standard.priceMonthly,
        highPrice: PLANS.pro.priceMonthly,
        offerCount: 2,
        description: '30-day free trial, no card required',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Tutuu',
      url: SITE_URL + '/',
      inLanguage: lang,
    },
  ]).replace(/</g, '\\u003c')
}

function socialTags({ title, description, url, locale, alternates = [] }) {
  return [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Tutuu" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="Tutuu: construction crew management app" />`,
    `<meta property="og:locale" content="${locale}" />`,
    ...alternates.map((l) => `<meta property="og:locale:alternate" content="${l}" />`),
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${OG_IMAGE}" />`,
  ]
}

// ── landing, one page per language ────────────────────────────────────────
const alternates = LANG_CODES.map((l) => `<link rel="alternate" hreflang="${l}" href="${landingUrl(l)}" />`)
alternates.push(`<link rel="alternate" hreflang="x-default" href="${landingUrl('en')}" />`)

for (const lang of LANG_CODES) {
  const meta = SEO[lang]
  const canonical = landingUrl(lang)
  const head = [
    `<title>${esc(meta.title)}</title>`,
    `<meta name="description" content="${esc(meta.description)}" />`,
    `<link rel="canonical" href="${canonical}" />`,
    ...alternates,
    ...socialTags({
      title: meta.ogTitle, description: meta.ogDescription, url: canonical, locale: OG_LOCALE[lang],
      alternates: LANG_CODES.filter((l) => l !== lang).map((l) => OG_LOCALE[l]),
    }),
    `<script type="application/ld+json">${jsonLd(lang)}</script>`,
  ].join('\n    ')
  const html = page({ lang, head, body: renderLanding(lang) })
  write(lang === 'en' ? '/' : `/${lang}`, html)
  // "/en" exists too (the language switcher links to it); its canonical is "/".
  if (lang === 'en') write('/en', html)
}

// ── secondary public pages (English) ──────────────────────────────────────
for (const p of STATIC_PAGES) {
  const url = SITE_URL + p.path
  const head = [
    `<title>${esc(p.title)}</title>`,
    `<meta name="description" content="${esc(p.description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    ...socialTags({ title: p.title, description: p.description, url, locale: OG_LOCALE.en }),
  ].join('\n    ')
  write(p.path, page({ lang: 'en', head, body: renderStatic(p.path) }))
}

// ── the app shell: same file as before, just not for search engines ───────
// (written last so it can't be overwritten; "/" above replaced dist/index.html)
const shellHead = ['<title>Tutuu</title>', '<meta name="robots" content="noindex, nofollow" />'].join('\n    ')
write('/app', page({ lang: 'en', head: shellHead, body: null }))

// ── sitemap.xml ───────────────────────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10)
const urls = []
for (const lang of LANG_CODES) {
  const links = [...LANG_CODES.map((l) => `      <xhtml:link rel="alternate" hreflang="${l}" href="${landingUrl(l)}" />`),
    `      <xhtml:link rel="alternate" hreflang="x-default" href="${landingUrl('en')}" />`].join('\n')
  urls.push(`  <url>\n    <loc>${landingUrl(lang)}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${lang === 'en' ? '1.0' : '0.8'}</priority>\n${links}\n  </url>`)
}
for (const p of STATIC_PAGES.filter((p) => p.sitemap)) {
  urls.push(`  <url>\n    <loc>${SITE_URL}${p.path}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.5</priority>\n  </url>`)
}
fs.writeFileSync(path.join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`)

const problems = checkDist(dist)
if (problems.length) {
  console.error('SEO check failed:\n - ' + problems.join('\n - '))
  process.exit(1)
}
console.log(`prerender: ${LANG_CODES.length} landing pages, ${STATIC_PAGES.length} static pages, app shell, sitemap. SEO check passed.`)
