// Bigger text for people who do not see well; the choice is remembered on this device.
const KEY = 'tutuu_text_size'
export const TEXT_SIZES = [100, 115, 130, 150]

function read() {
  try {
    const v = Number(localStorage.getItem(KEY))
    return TEXT_SIZES.includes(v) ? v : 100
  } catch { return 100 }
}

let current = read()

// Bigger text = the whole page zoomed through the viewport tag (like Safari's page zoom):
// layout width shrinks, so every size, button and gap grows together, and vh/dvh stay right.
// (CSS text-size-adjust was tried first; WebKit ignores it here.) Desktop browsers ignore
// the tag; there the browser's own zoom (Ctrl +) does the same.
const isNative = () => typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.()

function viewportFor(pct) {
  const native = isNative()
  if (pct === 100) {
    return native
      ? 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
      : 'width=device-width, initial-scale=1.0'
  }
  const z = pct / 100
  // iOS keeps the layout at device width unless the width is given explicitly
  const portrait = window.matchMedia('(orientation: portrait)').matches
  const device = portrait ? Math.min(screen.width, screen.height) : Math.max(screen.width, screen.height)
  const w = Math.round(device / z)
  return native
    ? `width=${w}, initial-scale=${z}, minimum-scale=${z}, maximum-scale=${z}, user-scalable=no, viewport-fit=cover`
    : `width=${w}, initial-scale=${z}, minimum-scale=${z}`
}

function apply(pct) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.textSize = String(pct)
  document.querySelector('meta[name="viewport"]')?.setAttribute('content', viewportFor(pct))
}

// main.jsx rewrites the viewport tag at startup in the iOS app, so apply again once the app mounts
export function initTextSize() {
  apply(current)
  window.addEventListener('orientationchange', () => setTimeout(() => apply(current), 250))
}

export const getTextSize = () => current

export function setTextSize(pct) {
  if (!TEXT_SIZES.includes(pct)) return
  current = pct
  apply(pct)
  try { localStorage.setItem(KEY, String(pct)) } catch { /* storage blocked */ }
  window.dispatchEvent(new Event('tutuu-text-size'))
}
