// Keeps the screen on while `on` is true (used during voice input) with the browser's
// Screen Wake Lock. The iOS app has its own native version of this file.
let lock = null
let wanted = false

async function acquire() {
  try {
    if (!('wakeLock' in navigator) || lock) return
    lock = await navigator.wakeLock.request('screen')
    lock.addEventListener('release', () => { lock = null })
  } catch { /* not allowed or not supported: the screen may dim as usual */ }
}

// The browser drops the lock when the tab is hidden; take it again on return
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (wanted && document.visibilityState === 'visible') acquire()
  })
}

export async function keepScreenAwake(on) {
  wanted = on
  if (on) await acquire()
  else { try { await lock?.release() } catch { /* already released */ } lock = null }
}
