// Opens the phone's share sheet (WhatsApp, SMS, Telegram...). Returns 'shared' | 'copied' | 'cancelled' | 'failed'.
// The iOS app has its own version of this file that uses the native share sheet.
export async function shareLink({ title, text, url }) {
  try {
    if (navigator.share) {
      await navigator.share({ title, text, url })
      return 'shared'
    }
  } catch (e) {
    if (e?.name === 'AbortError') return 'cancelled'
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`.trim())
    return 'copied'
  } catch {
    return 'failed'
  }
}
