// Everything the static landing pages need for search engines, link previews
// and AI crawlers. Pure data, no browser or store imports, so it is safe to
// load both in the browser and in the build-time prerender script.

export const SITE_URL = 'https://tutuu.net'

// Order matches LANGUAGES in i18n/useLanguage.js (the first one is the default).
export const LANG_CODES = ['en', 'ru', 'sr', 'es', 'pt', 'de', 'fr', 'sk', 'cs']

// BCP 47 / Open Graph locale for each language.
export const OG_LOCALE = {
  en: 'en_US', ru: 'ru_RU', sr: 'sr_RS', es: 'es_ES', pt: 'pt_BR',
  de: 'de_DE', fr: 'fr_FR', sk: 'sk_SK', cs: 'cs_CZ',
}

// English is served at "/" and also at "/en"; "/" is the canonical URL.
export const landingPath = (lang) => (lang === 'en' ? '/' : `/${lang}`)
export const landingUrl = (lang) => SITE_URL + (lang === 'en' ? '/' : `/${lang}`)

export const SEO = {
  en: {
    title: 'Tutuu: Construction Crew Management App',
    description: 'Track tasks, tools, attendance and salary for your construction crew. Free to start. Works on any phone.',
    ogTitle: 'Tutuu: Run your crew, not your paperwork',
    ogDescription: 'From task assignment to salary calculation, everything in one app for small construction crews.',
  },
  ru: {
    title: 'Tutuu: приложение для управления строительной бригадой',
    description: 'Задачи, инструменты, табель и зарплата вашей строительной бригады в одном приложении. Бесплатный старт. Работает на любом телефоне.',
    ogTitle: 'Tutuu: управляйте бригадой, а не бумагами',
    ogDescription: 'От постановки задач до расчёта зарплаты: всё в одном приложении для небольших строительных бригад.',
  },
  sr: {
    title: 'Tutuu: aplikacija za vođenje građevinske ekipe',
    description: 'Pratite zadatke, alate, prisustvo i zarade vaše građevinske ekipe. Besplatan početak. Radi na svakom telefonu.',
    ogTitle: 'Tutuu: vodite ekipu, a ne papirologiju',
    ogDescription: 'Od dodele zadataka do obračuna zarada, sve u jednoj aplikaciji za male građevinske ekipe.',
  },
  es: {
    title: 'Tutuu: app para gestionar cuadrillas de construcción',
    description: 'Controla tareas, herramientas, asistencia y salarios de tu cuadrilla de obra. Empieza gratis. Funciona en cualquier teléfono.',
    ogTitle: 'Tutuu: dirige tu cuadrilla, no el papeleo',
    ogDescription: 'Desde asignar tareas hasta calcular salarios, todo en una sola app para pequeñas cuadrillas de construcción.',
  },
  pt: {
    title: 'Tutuu: app de gestão de equipes de obra',
    description: 'Acompanhe tarefas, ferramentas, presença e salários da sua equipe de obra. Comece grátis. Funciona em qualquer celular.',
    ogTitle: 'Tutuu: gerencie sua equipe, não a papelada',
    ogDescription: 'Da atribuição de tarefas ao cálculo de salários, tudo em um só app para pequenas equipes de obra.',
  },
  de: {
    title: 'Tutuu: App zur Verwaltung von Baustellen-Teams',
    description: 'Aufgaben, Werkzeuge, Anwesenheit und Lohn Ihres Bauteams im Blick. Kostenlos starten. Funktioniert auf jedem Handy.',
    ogTitle: 'Tutuu: Führen Sie Ihr Team, nicht Ihren Papierkram',
    ogDescription: 'Von der Aufgabenverteilung bis zur Lohnabrechnung: alles in einer App für kleine Bauteams.',
  },
  fr: {
    title: "Tutuu : application de gestion d'équipe de chantier",
    description: 'Suivez les tâches, les outils, la présence et les salaires de votre équipe de chantier. Gratuit pour commencer. Fonctionne sur tous les téléphones.',
    ogTitle: 'Tutuu : gérez votre équipe, pas la paperasse',
    ogDescription: "De l'attribution des tâches au calcul des salaires, tout est réuni dans une seule application pour les petites équipes de chantier.",
  },
  sk: {
    title: 'Tutuu: aplikácia na riadenie stavebných partií',
    description: 'Sledujte úlohy, náradie, dochádzku a mzdy vašej stavebnej partie. Začnite zadarmo. Funguje na každom telefóne.',
    ogTitle: 'Tutuu: riaďte partiu, nie papierovanie',
    ogDescription: 'Od zadávania úloh po výpočet miezd, všetko v jednej aplikácii pre malé stavebné partie.',
  },
  cs: {
    title: 'Tutuu: aplikace pro řízení stavebních týmů',
    description: 'Sledujte úkoly, nářadí, docházku a mzdy vašeho stavebního týmu. Začněte zdarma. Funguje na každém telefonu.',
    ogTitle: 'Tutuu: řiďte tým, ne papírování',
    ogDescription: 'Od zadávání úkolů po výpočet mezd, vše v jedné aplikaci pro malé stavební týmy.',
  },
}

// Secondary English-only pages that are prerendered too, so bots and link
// previews can read them. path is the public URL, key the SPA route.
export const STATIC_PAGES = [
  { path: '/pricing', title: 'Tutuu pricing: Standard and Pro plans', description: 'Simple pricing for construction crews. 30-day free trial, no card required. Standard for up to 10 workers, Pro for unlimited.', sitemap: true },
  { path: '/install', title: 'Install Tutuu on iPhone and Android', description: 'How to add the Tutuu crew management app to your home screen on iPhone and Android. No app store needed.', sitemap: true },
  { path: '/terms', title: 'Terms of Service | Tutuu', description: 'Terms of Service for the Tutuu construction crew management app.', sitemap: true },
  { path: '/privacy', title: 'Privacy Policy | Tutuu', description: 'How Tutuu collects, uses and protects your data.', sitemap: true },
  { path: '/refund', title: 'Refund Policy | Tutuu', description: 'Refund and cancellation policy for Tutuu subscriptions.', sitemap: true },
]
