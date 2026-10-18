// Best-effort auto-matching of photos to tasks by the numbers in the file name
// (IMG_8512.HEIC → 8512) and the numbers a task mentions in its text
// ("IMG 8512-8514, 8535" or "Фото: 8540"). Purely a convenience — names are not
// reliable on every device, so everything stays editable by hand.

// Last run of 3+ digits in the file name, or null (e.g. "image.jpeg").
export function fileNumber(name) {
  const runs = String(name || '').replace(/\.[^.]+$/, '').match(/\d{3,}/g)
  return runs ? Number(runs[runs.length - 1]) : null
}

const GROUP_RE = /(?:img|photo|фото)[\s_:№#]*((?:\d{3,}(?:\s*[-–—]\s*\d{3,})?[\s,;]*)+)/gi
const ITEM_RE  = /(\d{3,})(?:\s*[-–—]\s*(\d{3,}))?/g
const MAX_RANGE = 200

// All photo numbers a piece of text refers to.
export function referencedNumbers(text) {
  const out = new Set()
  for (const g of String(text || '').matchAll(GROUP_RE)) {
    for (const m of g[1].matchAll(ITEM_RE)) {
      const a = Number(m[1])
      const b = m[2] ? Number(m[2]) : a
      if (b >= a && b - a <= MAX_RANGE) for (let n = a; n <= b; n++) out.add(n)
    }
  }
  return out
}

// Map<photoNumber, taskId[]> for a project's tasks.
export function buildRefIndex(tasks) {
  const index = new Map()
  for (const task of tasks) {
    for (const n of referencedNumbers(`${task.text || ''} ${task.description || ''}`)) {
      if (!index.has(n)) index.set(n, [])
      index.get(n).push(task.id)
    }
  }
  return index
}
