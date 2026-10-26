// Haptics on the web: only Android browsers can vibrate (iOS Safari cannot).
// The iOS app has its own native version of this file.
const PATTERN = { success: 15, warning: [20, 40, 20], error: [30, 60, 30], tap: 8 }

export function haptic(kind) {
  try { navigator.vibrate?.(PATTERN[kind] || 8) } catch { /* not supported */ }
}
