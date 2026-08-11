import translations from './translations'

// tasks.units arrays are index-aligned across every language (same 11 slots,
// same order — see translations.js) even though the actual unit strings
// differ per language (e.g. 'pcs' vs 'шт' vs 'kom'). English is the
// canonical index we store in the DB; these helpers translate a canonical
// code to/from whatever a given language displays for it.
const CANON = translations.en.tasks.units

// Any raw unit string ever stored (current language's code, or an older
// task's code from a different language, or free text from a CSV import)
// -> canonical English code. Falls through unchanged if it matches nothing,
// so genuinely custom units typed by a user are left alone.
export function normalizeUnit(raw) {
  if (!raw) return raw
  for (const lang of Object.keys(translations)) {
    const i = translations[lang]?.tasks?.units?.findIndex(u => u.value === raw)
    if (i > -1) return CANON[i]?.value ?? raw
  }
  return raw
}

// Canonical English code -> the short unit string for the given language
// (e.g. 'pcs' -> 'шт' when lang is 'ru'). Unknown codes pass through as-is.
export function unitLabel(code, lang) {
  if (!code) return ''
  const i = CANON.findIndex(u => u.value === code)
  if (i === -1) return code
  return translations[lang]?.tasks?.units?.[i]?.value ?? code
}

// Convenience: raw stored value (any language, any era) -> display string
// in the current UI language.
export function displayUnit(raw, lang) {
  return unitLabel(normalizeUnit(raw), lang)
}
