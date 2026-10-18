// Turns any photo a user can pick on any device (iPhone HEIC, Android/desktop
// JPEG/PNG/WebP) into a small JPEG plus a thumbnail, entirely in the browser.
//
// Decoding order, cheapest first:
//   1. createImageBitmap — covers JPEG/PNG/WebP everywhere, and HEIC where the
//      browser decodes it natively (Safari on iPhone/iPad/Mac).
//   2. heic-to (libheif/wasm) — only loaded when step 1 fails on a HEIC file
//      (Chrome/Edge/Firefox on Windows, Android, Linux). Lazy chunk, so nobody
//      else pays for its size.

const HEIC_RE = /\.(heic|heif)$/i

function looksHeic(file) {
  return /image\/hei[cf]/i.test(file.type || '') || HEIC_RE.test(file.name || '')
}

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      try { return await createImageBitmap(file) } catch { /* fall through */ }
    }
  }
  if (looksHeic(file)) {
    const { heicTo } = await import('heic-to')
    return heicTo({ blob: file, type: 'bitmap' })
  }
  throw new Error('unsupported image')
}

function drawScaled(bitmap, maxPx) {
  const { width: w, height: h } = bitmap
  const scale = Math.min(1, maxPx / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width  = Math.max(1, Math.round(w * scale))
  canvas.height = Math.max(1, Math.round(h * scale))
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas
}

function toJpeg(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', quality)
  })
}

// → { file: File (JPEG, original base name), thumb: Blob }
export async function prepareImage(file, { maxPx = 1600, quality = 0.82, thumbPx = 360 } = {}) {
  const bitmap = await decode(file)
  try {
    const full  = await toJpeg(drawScaled(bitmap, maxPx), quality)
    const thumb = await toJpeg(drawScaled(bitmap, thumbPx), 0.7)
    const base  = (file.name || 'photo').replace(/\.[^.]+$/, '')
    return { file: new File([full], `${base}.jpg`, { type: 'image/jpeg' }), thumb }
  } finally {
    bitmap.close?.()
  }
}
