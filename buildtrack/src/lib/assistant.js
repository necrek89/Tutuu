import { supabase } from './supabase'
import { useStore, MATERIAL_UNITS, currencySymbol } from '../store/useStore'
import { todayStr } from './date'
import { loadExtraContext, normalizeExtra, applyExtra } from './assistantOps'

const ATTENDANCE_STATUSES = ['present', 'absent', 'sick', 'vacation']
const PRIORITIES = ['high', 'normal', 'low']

// What the model may reference: only ids that exist in the user's own lists.
export async function buildContext() {
  const st = useStore.getState()
  await Promise.all([st.fetchProjects(), st.role === 'foreman' ? st.fetchRoster() : null])
  await st.fetchTasks()
  const extra = await loadExtraContext()
  const { projects, roster, role, tasks } = useStore.getState()
  return {
    ...extra,
    today: todayStr(),
    // Open tasks (newest first): what photos can be attached to
    tasks: tasks.filter(tk => tk.status !== 'approved').slice(0, 120)
      .map(tk => ({
        id: tk.id, project_id: tk.project_id, text: tk.text, stage: tk.stage, zone: tk.zone, description: tk.description,
        deadline: tk.deadline, status: tk.status, assignee: tk.worker?.name || null,
      })),
    projects: projects.map(p => ({
      id: p.id, name: p.name, status: p.status, address: p.address, deadline: p.deadline,
      stages: Array.isArray(p.stages) ? p.stages : [],
      zones:  Array.isArray(p.zones)  ? p.zones  : [],
    })),
    workers: role === 'foreman'
      ? roster.filter(w => !w.role || w.role === 'worker').map(w => ({ id: w.id, name: w.name, rate: w.default_rate, rate_type: w.rate_type, status: w.worker_status }))
      : [],
  }
}

// Returns { reply, actions, quota } or throws Error(code): unavailable | busy | limit | forbidden | server
export async function askAssistant(messages, context, images = [], hasDraft = false) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('unauthorized')
  let res
  try {
    res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/assistant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ messages, context, images, hasDraft }),
    })
  } catch {
    throw new Error('network')
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'server')
  return { reply: body.reply || '', actions: Array.isArray(body.actions) ? body.actions : [], quota: body.quota || null }
}

const findProject = (projects, id) => projects.find(p => Number(p.id) === Number(id))

// Cleans one proposed action against the real lists. Anything the model made up
// (unknown project/worker/stage) is dropped here rather than written.
const cleanIdx = (arr, n) => [...new Set((Array.isArray(arr) ? arr : [])
  .map(i => Number(i) - 1).filter(i => Number.isInteger(i) && i >= 0 && i < n))]

export function normalizeAction(action, photoCount = 0) {
  const { projects, roster, role } = useStore.getState()
  const input = action.input || {}

  if (action.tool === 'create_tasks') {
    const proj = findProject(projects, input.project_id)
    const known = proj?.stages || []
    const tasks = (Array.isArray(input.tasks) ? input.tasks : [])
      .map(tk => {
        const rawZone = String(tk.zone || '').trim().slice(0, 60)
        const knownZones = proj?.zones || []
        const zone = rawZone ? (knownZones.find(x => x.toLowerCase() === rawZone.toLowerCase()) || rawZone) : null
        const rawStage = String(tk.stage || '').trim().slice(0, 60)
        const stage = rawStage ? (known.find(x => x.toLowerCase() === rawStage.toLowerCase()) || rawStage) : null
        return {
          text: String(tk.text || '').trim().slice(0, 200),
          description: tk.description ? String(tk.description).trim().slice(0, 1000) : null,
          stage,
          newStage: !!stage && !known.includes(stage),
          zone,
          newZone: !!zone && !knownZones.includes(zone),
          worker_id: roster.some(w => w.id === tk.worker_id) ? tk.worker_id : null,
          priority: PRIORITIES.includes(tk.priority) ? tk.priority : 'normal',
          deadline: /^\d{4}-\d{2}-\d{2}$/.test(tk.deadline || '') ? tk.deadline : null,
          photoIdx: cleanIdx(tk.photo_indexes, photoCount),
        }
      })
      .filter(tk => tk.text)
    if (!proj || !tasks.length) return null
    return { tool: 'create_tasks', project: proj, tasks, warnings: (input.warnings || []).map(String).filter(Boolean).slice(0, 5) }
  }

  if (action.tool === 'add_zones') {
    const proj = findProject(projects, input.project_id)
    const known = (proj?.zones || []).map(z => z.toLowerCase())
    const seen = new Set(known)
    const zones = (Array.isArray(input.zones) ? input.zones : [])
      .map(z => String(z || '').trim().slice(0, 60))
      .filter(z => z && !seen.has(z.toLowerCase()) && seen.add(z.toLowerCase()))
    if (!proj || !zones.length) return null
    return { tool: 'add_zones', project: proj, zones }
  }

  if (action.tool === 'copy_tasks_to_zones') {
    const known = useStore.getState().tasks
    const sources = (Array.isArray(input.task_ids) ? input.task_ids : [])
      .map(id => known.find(tk => Number(tk.id) === Number(id))).filter(Boolean)
    if (!sources.length) return null
    // All copied tasks must belong to one project (zones are per project)
    const projectId = sources[0].project_id
    const proj = findProject(projects, projectId)
    const same = sources.filter(tk => Number(tk.project_id) === Number(projectId))
    const knownZones = proj?.zones || []
    const zones = [...new Set((Array.isArray(input.zones) ? input.zones : [])
      .map(z => String(z || '').trim().slice(0, 60)).filter(Boolean)
      .map(z => knownZones.find(x => x.toLowerCase() === z.toLowerCase()) || z))]
    if (!proj || !zones.length) return null
    // Do not duplicate a task that already exists in that zone
    const copies = []
    for (const zone of zones) {
      for (const src of same) {
        if (known.some(tk => Number(tk.project_id) === Number(projectId) && tk.zone === zone && tk.text === src.text)) continue
        copies.push({ src, zone })
      }
    }
    if (!copies.length || copies.length > 60) return null
    return {
      tool: 'copy_tasks_to_zones', project: proj, sources: same, copies,
      zones: zones.map(z => ({ name: z, isNew: !knownZones.includes(z) })),
    }
  }

  if (action.tool === 'update_task') {
    const known = useStore.getState().tasks
    const updates = (Array.isArray(input.updates) ? input.updates : [])
      .map(u => {
        const task = known.find(tk => Number(tk.id) === Number(u.task_id))
        if (!task) return null
        const changes = {}
        if (typeof u.text === 'string' && u.text.trim() && u.text.trim() !== task.text) changes.text = u.text.trim().slice(0, 200)
        if (typeof u.description === 'string' && u.description.trim() !== (task.description || '')) changes.description = u.description.trim().slice(0, 1000) || null
        if (typeof u.stage === 'string' && u.stage.trim() && u.stage.trim() !== task.stage) changes.stage = u.stage.trim().slice(0, 60)
        if (typeof u.zone === 'string' && u.zone.trim() && u.zone.trim() !== task.zone) changes.zone = u.zone.trim().slice(0, 60)
        if (/^\d{4}-\d{2}-\d{2}$/.test(u.deadline || '') && u.deadline !== task.deadline) changes.deadline = u.deadline
        if (/^\d{4}-\d{2}-\d{2}$/.test(u.start_date || '') && u.start_date !== task.start_date) changes.start_date = u.start_date
        if (PRIORITIES.includes(u.priority) && u.priority !== task.priority) changes.priority = u.priority
        if (roster.some(w => w.id === u.worker_id) && u.worker_id !== task.worker_id) changes.worker_id = u.worker_id
        if (['approved', 'new'].includes(u.status) && u.status !== task.status) changes.status = u.status
        if (!Object.keys(changes).length) return null
        const before = {
          text: task.text, description: task.description || '', stage: task.stage || '', zone: task.zone || '', deadline: task.deadline || '',
          start_date: task.start_date || '', priority: task.priority || '', worker_id: task.worker?.name || '', status: task.status,
        }
        return { task, changes, before }
      })
      .filter(Boolean)
    if (!updates.length) return null
    return { tool: 'update_task', updates }
  }

  if (action.tool === 'delete_task') {
    const known = useStore.getState().tasks
    const tasks = (Array.isArray(input.task_ids) ? input.task_ids : [])
      .map(id => known.find(tk => Number(tk.id) === Number(id))).filter(Boolean)
    if (!tasks.length) return null
    return { tool: 'delete_task', tasks }
  }

  if (action.tool === 'attach_photos') {
    const attachments = (Array.isArray(input.attachments) ? input.attachments : [])
      .map(at => {
        const task = useStore.getState().tasks.find(tk => Number(tk.id) === Number(at.task_id))
        const photoIdx = cleanIdx(at.photo_indexes, photoCount)
        return task && photoIdx.length ? { task, photoIdx } : null
      })
      .filter(Boolean)
    if (!attachments.length) return null
    return { tool: 'attach_photos', attachments }
  }

  if (action.tool === 'mark_attendance') {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(input.date || '') ? input.date : todayStr()
    const records = (Array.isArray(input.records) ? input.records : [])
      .map(r => {
        const worker = roster.find(w => w.id === r.worker_id)
        if (!worker || !ATTENDANCE_STATUSES.includes(r.status)) return null
        return {
          worker_id: worker.id, name: worker.name, status: r.status,
          arrived_at: /^\d{1,2}:\d{2}$/.test(r.arrived_at || '') ? r.arrived_at : null,
        }
      })
      .filter(Boolean)
    if (!records.length) return null
    return { tool: 'mark_attendance', date, records }
  }

  if (action.tool === 'add_material_request') {
    const proj = findProject(projects, input.project_id)
    const items = (Array.isArray(input.items) ? input.items : [])
      .map(it => ({
        name: String(it.name || '').trim().slice(0, 120),
        qty: Number.isFinite(Number(it.qty)) && Number(it.qty) > 0 ? Number(it.qty) : null,
        unit: MATERIAL_UNITS.includes(it.unit) ? it.unit : null,
        notes: it.notes ? String(it.notes).slice(0, 300) : null,
      }))
      .filter(it => it.name)
    if (!proj || !items.length) return null
    return { tool: 'add_material_request', project: proj, items, asForeman: role === 'foreman' }
  }

  return normalizeExtra(action)
}

// Applies one normalized action with the user's own session. Returns { error } (null = ok).
// Photos are already compressed (imagePrep); upload each at most once per apply
async function uploadPhoto(file) {
  const uid = useStore.getState().profile?.id || 'anon'
  const path = `${uid}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`
  const { error } = await supabase.storage.from('task-photos').upload(path, file, { upsert: true })
  if (error) return null
  return supabase.storage.from('task-photos').getPublicUrl(path).data.publicUrl
}

async function attachUrls(taskId, urls) {
  // Read the task fresh so photos added elsewhere meanwhile are kept
  const cur = useStore.getState().tasks.find(tk => String(tk.id) === String(taskId))
  if (!cur) return { error: new Error('task not found') }
  const merged = [...(cur.photo_url ? cur.photo_url.split(',').filter(Boolean) : []), ...urls]
  return useStore.getState().updateTask(cur.id, { photo_url: merged.join(',') })
}

export async function applyAction(a, photoFiles = []) {
  const st = useStore.getState()
  const urlCache = a._urls || (a._urls = new Map())
  const urlsFor = async (idxs) => {
    const out = []
    for (const i of idxs) {
      if (!urlCache.has(i)) urlCache.set(i, await uploadPhoto(photoFiles[i]))
      if (!urlCache.get(i)) return null
      out.push(urlCache.get(i))
    }
    return out
  }

  if (a.tool === 'create_tasks') {
    const currency = currencySymbol(st.profile?.currency)
    // New stages and zones become part of the project's lists, like a CSV import does
    // Read the project as it is now: an add_zones action in the same batch may have just changed it
    const cur = st.projects.find(p => Number(p.id) === Number(a.project.id)) || a.project
    const stages = Array.isArray(cur.stages) ? [...cur.stages] : []
    const zonesList = Array.isArray(cur.zones) ? [...cur.zones] : []
    const addedStages = [...new Set(a.tasks.map(tk => tk.stage).filter(sg => sg && !stages.includes(sg)))]
    const addedZones = [...new Set(a.tasks.map(tk => tk.zone).filter(z => z && !zonesList.includes(z)))]
    if (addedStages.length || addedZones.length) {
      const patch = {}
      if (addedStages.length) patch.stages = [...stages, ...addedStages]
      if (addedZones.length) patch.zones = [...zonesList, ...addedZones]
      const { error } = await st.updateProject(a.project.id, patch)
      if (error) return { error }
    }
    // One by one so the tasks keep the order they were said in. Progress is
    // remembered on the action, so "try again" never creates a task twice.
    for (const tk of a.tasks) {
      if (!tk.createdId) {
        const { data, error } = await st.addTask({
          text: tk.text, description: tk.description, project_id: a.project.id, status: 'new', priority: tk.priority, currency,
          stage: tk.stage, zone: tk.zone, worker_id: tk.worker_id, deadline: tk.deadline,
        })
        if (error || !data) return { error: error || new Error('not created') }
        tk.createdId = data.id
      }
      if (tk.photoIdx?.length && !tk.photosDone) {
        const urls = await urlsFor(tk.photoIdx)
        if (!urls) return { error: new Error('upload') }
        const res = await attachUrls(tk.createdId, urls)
        if (res?.error) return res
        tk.photosDone = true
      }
    }
    await st.fetchTasks(a.project.id)
    return { error: null }
  }

  if (a.tool === 'copy_tasks_to_zones') {
    const cur = st.projects.find(p => Number(p.id) === Number(a.project.id)) || a.project
    const zonesList = Array.isArray(cur.zones) ? [...cur.zones] : []
    const addedZones = a.zones.map(z => z.name).filter(z => !zonesList.includes(z))
    if (addedZones.length) {
      const { error } = await st.updateProject(a.project.id, { zones: [...zonesList, ...addedZones] })
      if (error) return { error }
    }
    const currency = currencySymbol(st.profile?.currency)
    for (const c of a.copies) {
      if (c.done) continue
      const s0 = c.src
      const { error } = await st.addTask({
        text: s0.text, description: s0.description || null, project_id: a.project.id, status: 'new',
        priority: s0.priority || 'normal', currency: s0.currency || currency, stage: s0.stage || null, zone: c.zone,
        quantity: s0.quantity ?? null, unit: s0.unit || null, cost: s0.cost ?? null,
        deadline: s0.deadline || null, start_date: s0.start_date || null,
      })
      if (error) return { error }
      c.done = true
    }
    await st.fetchTasks(a.project.id)
    return { error: null }
  }

  if (a.tool === 'add_zones') {
    const proj = st.projects.find(p => Number(p.id) === Number(a.project.id))
    const current = Array.isArray(proj?.zones) ? proj.zones : []
    const merged = [...current, ...a.zones.filter(z => !current.some(c => c.toLowerCase() === z.toLowerCase()))]
    return st.updateProject(a.project.id, { zones: merged })
  }

  if (a.tool === 'update_task') {
    for (const u of a.updates) {
      if (u.done) continue
      const { status, ...fields } = u.changes
      // A new stage name joins the project's stage list, as when tasks are created
      if (fields.stage) {
        const proj = st.projects.find(p => Number(p.id) === Number(u.task.project_id))
        const stages = Array.isArray(proj?.stages) ? proj.stages : []
        if (proj && !stages.includes(fields.stage)) {
          const { error } = await st.updateProject(proj.id, { stages: [...stages, fields.stage] })
          if (error) return { error }
        }
      }
      if (fields.zone) {
        const proj = st.projects.find(p => Number(p.id) === Number(u.task.project_id))
        const zones = Array.isArray(proj?.zones) ? proj.zones : []
        if (proj && !zones.includes(fields.zone)) {
          const { error } = await st.updateProject(proj.id, { zones: [...zones, fields.zone] })
          if (error) return { error }
        }
      }
      if (Object.keys(fields).length) {
        const res = await st.updateTask(u.task.id, fields)
        if (res?.error) return res
      }
      if (status === 'approved') {
        const res = await st.approveTask(u.task.id)
        if (res?.error) return res
      } else if (status === 'new') {
        const res = await st.updateTask(u.task.id, { status: 'new' })
        if (res?.error) return res
        await st.recalcProgress(u.task.project_id)
      }
      u.done = true
    }
    return { error: null }
  }

  if (a.tool === 'delete_task') {
    for (const tk of a.tasks) {
      if (tk.deleted) continue
      const res = await st.deleteTask(tk.id)
      if (res?.error) return res
      tk.deleted = true
    }
    return { error: null }
  }

  if (a.tool === 'attach_photos') {
    for (const at of a.attachments) {
      if (at.done) continue
      const urls = await urlsFor(at.photoIdx)
      if (!urls) return { error: new Error('upload') }
      const res = await attachUrls(at.task.id, urls)
      if (res?.error) return res
      at.done = true
    }
    return { error: null }
  }

  if (a.tool === 'mark_attendance') {
    return st.saveAttendance(a.records.map(r => ({
      worker_id: r.worker_id, date: a.date, status: r.status, arrived_at: r.arrived_at,
    })))
  }

  if (a.tool === 'add_material_request') {
    for (const it of a.items) {
      const res = a.asForeman
        ? await st.addMaterial({ projectId: a.project.id, name: it.name, qty: it.qty, unit: it.unit, note: it.notes })
        : await st.addMaterialRequest({ project_id: a.project.id, name: it.name, qty: it.qty, unit: it.unit, notes: it.notes })
      if (res?.error) return { error: res.error }
    }
    return { error: null }
  }

  return applyExtra(a, photoFiles)
}

// Speech to text on the server (much better than the on-device engine).
// Returns { text, quota }; throws Error(code): busy | limit | unavailable | network
export async function transcribeAudio(blob) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('unauthorized')
  let res
  try {
    res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe`, {
      method: 'POST',
      headers: {
        'Content-Type': blob.type || 'audio/mp4',
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: blob,
    })
  } catch {
    throw new Error('network')
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'server')
  return { text: body.text || '', quota: body.quota || null }
}

// Wakes the transcribe function (and the connection to it) when recording starts,
// so the first phrase does not pay for a cold start. Sends no audio, costs nothing.
export async function warmUpTranscribe() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'audio/mp4', Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
      body: new Uint8Array(10),
    })
  } catch { /* best effort */ }
}
