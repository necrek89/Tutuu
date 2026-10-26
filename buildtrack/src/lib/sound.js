import { haptic } from './haptics'

// Short synthesized sounds (Web Audio): no audio files to ship, same on the site and in
// the iOS app. Users can turn sounds and haptics off in Account. Sounds follow the phone's
// silent switch; haptics still work then.
const KEY_SOUND = 'tutuu_sound'
const KEY_HAPTICS = 'tutuu_haptics'
const MASTER = 0.3

const read = (key) => {
  try { return localStorage.getItem(key) !== '0' } catch { return true }
}
const write = (key, on) => {
  try { localStorage.setItem(key, on ? '1' : '0') } catch { /* storage blocked */ }
}

let soundOn = read(KEY_SOUND)
let hapticsOn = read(KEY_HAPTICS)
export const getSoundPrefs = () => ({ sound: soundOn, haptics: hapticsOn })
export const setSoundPref = (on) => { soundOn = on; write(KEY_SOUND, on) }
export const setHapticsPref = (on) => { hapticsOn = on; write(KEY_HAPTICS, on) }

// [frequency Hz, start s, length s, wave]
const PATTERNS = {
  success:  [[660, 0, 0.09, 'sine'], [880, 0.08, 0.15, 'sine']],
  done:     [[523, 0, 0.09, 'sine'], [659, 0.09, 0.09, 'sine'], [784, 0.18, 0.2, 'sine']],
  delete:   [[440, 0, 0.08, 'triangle'], [294, 0.07, 0.16, 'triangle']],
  error:    [[233, 0, 0.14, 'triangle'], [196, 0.15, 0.2, 'triangle']],
  recStart: [[740, 0, 0.07, 'sine']],
  recStop:  [[520, 0, 0.08, 'sine']],
  reply:    [[880, 0, 0.07, 'sine'], [1175, 0.07, 0.11, 'sine']],
}
const HAPTIC_FOR = { success: 'success', done: 'success', delete: 'warning', error: 'error', recStart: 'tap', recStop: 'tap', reply: 'tap' }

let ctx = null
let quiet = 0

function audio() {
  if (ctx) return ctx
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (AC) ctx = new AC()
  } catch { ctx = null }
  return ctx
}

// Browsers keep audio locked until a tap; unlock it on the first one
if (typeof document !== 'undefined') {
  const unlock = () => { const c = audio(); if (c && c.state === 'suspended') c.resume().catch(() => {}) }
  document.addEventListener('pointerdown', unlock, { passive: true })
  document.addEventListener('keydown', unlock, { passive: true })
}

function play(name) {
  const c = audio()
  if (!c || c.state === 'closed') return
  if (c.state === 'suspended') c.resume().catch(() => {})
  const t0 = c.currentTime + 0.01
  for (const [freq, start, len, wave] of PATTERNS[name]) {
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = wave
    osc.frequency.value = freq
    const a = t0 + start
    gain.gain.setValueAtTime(0.0001, a)
    gain.gain.linearRampToValueAtTime(MASTER, a + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, a + len)
    osc.connect(gain).connect(c.destination)
    osc.start(a)
    osc.stop(a + len + 0.02)
  }
}

export function playSound(name) {
  if (quiet > 0 || !PATTERNS[name]) return
  if (soundOn) { try { play(name) } catch { /* audio is a nicety, never a failure */ } }
  if (hapticsOn) haptic(HAPTIC_FOR[name])
}

// Runs fn without the per-action sounds (a batch plays one sound itself at the end)
export async function quietly(fn) {
  quiet++
  try { return await fn() } finally { quiet-- }
}
