// Invitation links: https://tutuu.net/app?join=<invite code>.
// The code is kept across sign-in/sign-up, then the app asks "send the request?" once.
const KEY = 'tutuu_pending_join'

// Call once at start: moves ?join=CODE from the address into storage and cleans the address.
export function captureJoinCode() {
  try {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('join')
    if (!code) return
    localStorage.setItem(KEY, code.trim().toLowerCase())
    params.delete('join')
    const rest = params.toString()
    window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash)
  } catch { /* storage blocked: the link just does nothing */ }
}

export const getPendingJoin = () => {
  try { return localStorage.getItem(KEY) || '' } catch { return '' }
}
export const clearPendingJoin = () => {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}

export const inviteLinkFor = (code) => `${window.location.origin}/app?join=${code || ''}`

// A pasted full link or a bare code both work
export function codeFromInput(text) {
  const t = String(text || '').trim()
  const m = t.match(/[?&]join=([^&\s#]+)/i)
  return (m ? m[1] : t).toLowerCase()
}
