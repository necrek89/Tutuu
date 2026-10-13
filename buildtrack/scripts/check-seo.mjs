// Asserts the prerendered site has what search engines, link previews and AI
// crawlers need. Used by the build (prerender.mjs) and runnable on its own:
//   node scripts/check-seo.mjs
import fs from 'node:fs'
import path from 'node:path'
import { SITE_URL, LANG_CODES, STATIC_PAGES, landingUrl } from '../src/seo/siteMeta.js'

const read = (dist, p) => fs.readFileSync(path.join(dist, p), 'utf8')
const textOf = (html) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
const headOf = (html) => html.slice(0, html.indexOf('</head>'))

export function checkDist(dist) {
  const bad = []
  const must = (cond, msg) => { if (!cond) bad.push(msg) }

  const pages = [
    ...LANG_CODES.map((l) => ({ file: l === 'en' ? 'index.html' : `${l}/index.html`, lang: l, url: landingUrl(l), landing: true })),
    { file: 'en/index.html', lang: 'en', url: landingUrl('en'), landing: true },
    ...STATIC_PAGES.map((p) => ({ file: `${p.path.slice(1)}/index.html`, lang: 'en', url: SITE_URL + p.path, landing: false })),
  ]
  for (const pg of pages) {
    if (!fs.existsSync(path.join(dist, pg.file))) { bad.push(`${pg.file} is missing`); continue }
    const html = read(dist, pg.file)
    const head = headOf(html)
    must(html.includes(`<html lang="${pg.lang}"`), `${pg.file}: wrong <html lang>`)
    must(/<title>[^<]{10,}<\/title>/.test(head), `${pg.file}: no title`)
    must(/<meta name="description" content="[^"]{40,}"/.test(head), `${pg.file}: no meta description`)
    must(head.includes(`<link rel="canonical" href="${pg.url}"`) || pg.file === 'en/index.html', `${pg.file}: wrong canonical`)
    must(head.includes('property="og:image" content="https://tutuu.net/og-image.png"'), `${pg.file}: no og:image`)
    must(head.includes('name="twitter:card" content="summary_large_image"'), `${pg.file}: no twitter card`)
    must(!/—/.test(head), `${pg.file}: em dash in head tags`)
    must(!head.includes('noindex'), `${pg.file}: must be indexable`)
    must(html.includes('data-prerendered="1"'), `${pg.file}: not prerendered`)
    must(textOf(html.slice(html.indexOf('<body'))).length > (pg.landing ? 1500 : 250), `${pg.file}: body text is nearly empty`)
    if (pg.landing) {
      must(/<h1[^>]*>/.test(html), `${pg.file}: no <h1>`)
      for (const l of LANG_CODES) must(head.includes(`hreflang="${l}" href="${landingUrl(l)}"`), `${pg.file}: hreflang ${l} missing`)
      must(head.includes(`hreflang="x-default" href="${landingUrl('en')}"`), `${pg.file}: x-default missing`)
      must(html.includes('href="/app"'), `${pg.file}: no crawlable link to /app`)
      for (const l of LANG_CODES) must(new RegExp(`<a [^>]*href="${l === 'en' ? '/' : '/' + l}"[^>]*hrefLang="${l}"|<a [^>]*hrefLang="${l}"[^>]*href="${l === 'en' ? '/' : '/' + l}"`).test(html), `${pg.file}: no crawlable link to the ${l} page`)
      must(!/<script src="https:\/\/cdn\.paddle\.com/.test(html), `${pg.file}: Paddle script must not load here`)
    }
  }
  const en = read(dist, 'index.html')
  must(en.includes("location.replace('/app' + s + h)") && en.includes('tutuu_lang'), 'English "/" is missing the early language redirect')
  for (const l of LANG_CODES.filter((x) => x !== 'en')) must(!read(dist, `${l}/index.html`).includes('location.replace('), `${l}/index.html must not redirect`)
  must(!read(dist, 'en/index.html').includes('location.replace('), 'en/index.html must not redirect')
  must(/<head[\s\S]*Run your crew/.test(en) || /Run your crew/.test(en), 'English landing text missing')

  if (!fs.existsSync(path.join(dist, 'app/index.html'))) bad.push('app/index.html is missing')
  else {
    const shell = read(dist, 'app/index.html')
    must(shell.includes('name="robots" content="noindex, nofollow"'), 'app shell must be noindex')
    must(!shell.includes('data-prerendered'), 'app shell must stay an empty single-page shell')
    must(/<script type="module"[^>]+src="\/assets\//.test(shell), 'app shell lost its script tag')
  }

  if (!fs.existsSync(path.join(dist, 'sitemap.xml'))) bad.push('sitemap.xml is missing')
  else {
    const sm = read(dist, 'sitemap.xml')
    for (const l of LANG_CODES) must(sm.includes(`<loc>${landingUrl(l)}</loc>`), `sitemap lacks ${landingUrl(l)}`)
    must(!sm.includes('/app<'), 'sitemap must not list /app')
  }
  return bad
}

// CLI
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const dist = path.resolve(import.meta.dirname, '..', 'dist')
  const problems = checkDist(dist)
  if (problems.length) { console.error('SEO check failed:\n - ' + problems.join('\n - ')); process.exit(1) }
  console.log('SEO check passed')
}
