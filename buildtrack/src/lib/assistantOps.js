import { supabase } from './supabase'
import { useStore, currencySymbol } from '../store/useStore'
import { useLang } from '../i18n/useLanguage'
import { todayStr } from './date'

// Everything the app can do by hand, as assistant actions (foreman unless noted).
// For each tool: `normalize` checks the model's proposal against the user's own lists
// (unknown ids are dropped) and builds a generic preview { title, lines, danger };
// `apply` runs it through the same store actions the screens use.

const tr = (key, vars) => useLang.getState().t(key, vars)
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const num = (v) => (v !== null && v !== '' && v !== undefined && Number.isFinite(Number(v)) ? Number(v) : null)
const dateOr = (d) => (DATE_RE.test(d || '') ? d : todayStr())
const text = (v, n) => String(v ?? '').trim().slice(0, n)
const CATEGORIES = ['materials', 'labor', 'equipment', 'transport', 'other']
const money = (amount, cur) => `${amount} ${cur}`
const cleanIdx = (i, n) => { const k = Number(i) - 1; return Number.isInteger(k) && k >= 0 && k < n ? k : null }

// Lists loaded for the model; also what ids are validated against
export const lists = { expenses: [], workLogs: [], payments: [] }

export async function loadExtraContext() {
  const st = useStore.getState()
  if (st.role !== 'foreman') return {}
  const projectIds = st.projects.map(p => p.id)
  const workerIds = (st.roster || []).map(w => w.id)
  const empty = { data: [] }
  const [ex, wl, pay] = await Promise.all([
    projectIds.length
      ? supabase.from('expenses').select('id,project_id,title,amount,currency,category,date').in('project_id', projectIds).order('date', { ascending: false }).limit(30)
      : empty,
    workerIds.length
      ? supabase.from('work_logs').select('id,worker_id,log_date,log_type,value,rate').in('worker_id', workerIds).order('log_date', { ascending: false }).limit(30)
      : empty,
    workerIds.length
      ? supabase.from('worker_payments').select('id,worker_id,amount,paid_at,notes').in('worker_id', workerIds).order('paid_at', { ascending: false }).limit(20)
      : empty,
    st.fetchTools(), st.fetchMaterials(), st.fetchJoinRequests(),
  ])
  lists.expenses = ex.data || []
  lists.workLogs = wl.data || []
  lists.payments = pay.data || []
  const { tools, materials, joinRequests, profile } = useStore.getState()
  return {
    currency: profile?.currency || 'USD',
    expenses: lists.expenses,
    work_logs: lists.workLogs.map(l => ({ id: l.id, worker_id: l.worker_id, date: l.log_date, type: l.log_type, value: l.value, rate: l.rate })),
    payments: lists.payments.map(x => ({ id: x.id, worker_id: x.worker_id, amount: x.amount, date: x.paid_at, notes: x.notes })),
    tools: tools.map(x => ({ id: x.id, name: x.name, status: x.status, location: x.location, project_id: x.project_id, worker_id: x.worker_id })),
    materials: materials.filter(m => m.status === 'needed').slice(0, 40).map(m => ({ id: m.id, project_id: m.projectId, name: m.name, qty: m.qty, unit: m.unit, status: m.status })),
    join_requests: (joinRequests || []).map(r => ({ id: r.id, worker_id: r.worker?.id, name: r.worker?.name })),
  }
}

const generic = (tool, title, lines, extra = {}) => ({ tool, generic: true, title, lines, ...extra })

export function normalizeExtra(action) {
  const { projects, roster, tasks, tools, materials, joinRequests, profile } = useStore.getState()
  const input = action.input || {}
  const project = (id) => projects.find(p => Number(p.id) === Number(id))
  const worker = (id) => roster.find(w => w.id === id)
  const cur = profile?.currency || 'USD'
  const catLabel = (c) => tr(`assistant.cat_${c}`)
  const unitLabel = (type) => tr(type === 'hours' ? 'assistant.unit_hours' : 'assistant.unit_shift')

  switch (action.tool) {
    case 'add_expenses': {
      const proj = project(input.project_id)
      const items = (Array.isArray(input.items) ? input.items : []).slice(0, 20).map(it => {
        const amount = num(it.amount)
        const title = text(it.title, 120)
        if (!title || amount === null || amount <= 0) return null
        return {
          title, amount, currency: /^[A-Za-z]{3}$/.test(it.currency || '') ? it.currency.toUpperCase() : cur,
          category: CATEGORIES.includes(it.category) ? it.category : 'other', date: dateOr(it.date),
          notes: it.notes ? text(it.notes, 300) : null, photoIdx: cleanIdx(it.photo_index, 5),
        }
      }).filter(Boolean)
      if (!proj || !items.length) return null
      return generic('add_expenses', tr('assistant.op_add_expenses', { name: proj.name }),
        items.map(i => `${i.title}: ${money(i.amount, i.currency)} (${catLabel(i.category)}, ${i.date})${i.photoIdx !== null ? ' + ' + tr('assistant.receipt') : ''}`), { project: proj, items })
    }
    case 'update_expense': {
      const e = lists.expenses.find(x => Number(x.id) === Number(input.expense_id))
      if (!e) return null
      const changes = {}
      if (text(input.title, 120) && text(input.title, 120) !== e.title) changes.title = text(input.title, 120)
      if (num(input.amount) !== null && num(input.amount) > 0 && num(input.amount) !== Number(e.amount)) changes.amount = num(input.amount)
      if (CATEGORIES.includes(input.category) && input.category !== e.category) changes.category = input.category
      if (DATE_RE.test(input.date || '') && input.date !== e.date) changes.date = input.date
      if (input.notes !== undefined && text(input.notes, 300)) changes.notes = text(input.notes, 300)
      if (!Object.keys(changes).length) return null
      const lines = Object.entries(changes).map(([k, v]) => `${tr(`assistant.ef_${k}`)}: ${e[k] ?? '—'} → ${v}`)
      return generic('update_expense', `${tr('assistant.op_update_expense')}: ${e.title}`, lines, { id: e.id, changes })
    }
    case 'delete_expenses': {
      const found = (Array.isArray(input.expense_ids) ? input.expense_ids : []).map(id => lists.expenses.find(x => Number(x.id) === Number(id))).filter(Boolean)
      if (!found.length) return null
      return generic('delete_expenses', tr('assistant.op_delete_expenses', { n: found.length }), found.map(e => `${e.title}: ${money(e.amount, e.currency || cur)} (${e.date})`), { ids: found.map(e => e.id), danger: true })
    }
    case 'add_work_logs': {
      const entries = (Array.isArray(input.entries) ? input.entries : []).slice(0, 30).map(en => {
        const w = worker(en.worker_id); const value = num(en.value)
        if (!w || value === null || value <= 0) return null
        const type = en.type === 'hours' || en.type === 'shift' ? en.type : (w.rate_type === 'hours' ? 'hours' : 'shift')
        const sameType = Number(w.default_rate) > 0 && (w.rate_type || 'shift') === type
        const rate = sameType ? Number(w.default_rate) : (num(en.rate) ?? 0)
        return { worker_id: w.id, name: w.name, date: dateOr(en.date), value, type, rate, notes: en.notes ? text(en.notes, 300) : null, rateMismatch: Number(w.default_rate) > 0 && !sameType }
      }).filter(Boolean)
      if (!entries.length) return null
      return generic('add_work_logs', tr('assistant.op_add_work_logs'),
        entries.map(en => `${en.name}: ${en.value} ${unitLabel(en.type)}, ${en.date}${en.rate ? ` (${tr('assistant.rate')} ${en.rate})` : ''}${en.rateMismatch ? ' (' + tr('assistant.rateMismatch') + ')' : ''}`), { entries })
    }
    case 'update_work_log': {
      const l = lists.workLogs.find(x => Number(x.id) === Number(input.log_id))
      if (!l) return null
      const changes = {}
      if (num(input.value) !== null && num(input.value) > 0 && num(input.value) !== Number(l.value)) changes.value = num(input.value)
      if ((input.type === 'hours' || input.type === 'shift') && input.type !== l.log_type) changes.log_type = input.type
      if (num(input.rate) !== null && num(input.rate) !== Number(l.rate)) changes.rate = num(input.rate)
      if (input.notes !== undefined && text(input.notes, 300)) changes.notes = text(input.notes, 300)
      if (!Object.keys(changes).length) return null
      const w = worker(l.worker_id)
      return generic('update_work_log', `${tr('assistant.op_update_work_log')}: ${w?.name || ''} ${l.log_date}`,
        Object.entries(changes).map(([k, v]) => `${k === 'value' ? tr('assistant.value') : k === 'log_type' ? tr('assistant.type') : k === 'rate' ? tr('assistant.rate') : k}: ${l[k] ?? '—'} → ${v}`), { id: l.id, workerId: l.worker_id, changes })
    }
    case 'delete_work_logs': {
      const found = (Array.isArray(input.log_ids) ? input.log_ids : []).map(id => lists.workLogs.find(x => Number(x.id) === Number(id))).filter(Boolean)
      if (!found.length) return null
      return generic('delete_work_logs', tr('assistant.op_delete_work_logs', { n: found.length }),
        found.map(l => `${worker(l.worker_id)?.name || ''}: ${l.value} ${unitLabel(l.log_type)}, ${l.log_date}`), { logs: found, danger: true })
    }
    case 'add_payments': {
      const payments = (Array.isArray(input.payments) ? input.payments : []).slice(0, 30).map(p => {
        const w = worker(p.worker_id); const amount = num(p.amount)
        if (!w || amount === null || amount <= 0) return null
        return { worker_id: w.id, name: w.name, amount, date: dateOr(p.date), notes: p.notes ? text(p.notes, 200) : null }
      }).filter(Boolean)
      if (!payments.length) return null
      return generic('add_payments', tr('assistant.op_add_payments'), payments.map(p => `${p.name}: ${money(p.amount, cur)}, ${p.date}${p.notes ? ' (' + p.notes + ')' : ''}`), { payments })
    }
    case 'delete_payments': {
      const found = (Array.isArray(input.payment_ids) ? input.payment_ids : []).map(id => lists.payments.find(x => Number(x.id) === Number(id))).filter(Boolean)
      if (!found.length) return null
      return generic('delete_payments', tr('assistant.op_delete_payments', { n: found.length }),
        found.map(x => `${worker(x.worker_id)?.name || ''}: ${money(x.amount, cur)}, ${x.paid_at}`), { payments: found, danger: true })
    }
    case 'add_tool': {
      const name = text(input.name, 80)
      if (!name) return null
      const proj = input.project_id != null ? project(input.project_id) : null
      const w = input.worker_id ? worker(input.worker_id) : null
      const data = { name, location: input.location ? text(input.location, 80) : null, status: ['active', 'stored', 'lost'].includes(input.status) ? input.status : 'active', project_id: proj?.id || null, worker_id: w?.id || null }
      return generic('add_tool', tr('assistant.op_add_tool'), [`${name}${data.location ? ', ' + data.location : ''}${proj ? ' → ' + proj.name : ''}${w ? ' → ' + w.name : ''}`], { data })
    }
    case 'update_tool': {
      const tool = tools.find(x => Number(x.id) === Number(input.tool_id))
      if (!tool) return null
      const changes = {}
      if (text(input.name, 80) && text(input.name, 80) !== tool.name) changes.name = text(input.name, 80)
      if (input.location !== undefined && text(input.location, 80) !== (tool.location || '')) changes.location = text(input.location, 80) || null
      if (['active', 'stored', 'lost'].includes(input.status) && input.status !== tool.status) changes.status = input.status
      const lines = []
      if (input.unassign) {
        Object.assign(changes, { project_id: null, worker_id: null, assigned_at: null, assigned_by_name: null })
        lines.push(tr('assistant.toolUnassign'))
      } else {
        const proj = input.project_id != null ? project(input.project_id) : null
        const w = input.worker_id ? worker(input.worker_id) : null
        if (proj) { changes.project_id = proj.id; lines.push(`→ ${proj.name}`) }
        if (w) { changes.worker_id = w.id; lines.push(`→ ${w.name}`) }
        if (proj || w) { changes.assigned_at = new Date().toISOString(); changes.assigned_by_name = profile?.name || '' }
      }
      for (const k of ['name', 'location', 'status']) if (changes[k] !== undefined) lines.push(`${tr(`assistant.tf_${k}`)}: ${tool[k] ?? '—'} → ${changes[k] ?? '—'}`)
      if (!Object.keys(changes).length) return null
      return generic('update_tool', `${tr('assistant.op_update_tool')}: ${tool.name}`, lines, { id: tool.id, changes })
    }
    case 'delete_tools': {
      const found = (Array.isArray(input.tool_ids) ? input.tool_ids : []).map(id => tools.find(x => Number(x.id) === Number(id))).filter(Boolean)
      if (!found.length) return null
      return generic('delete_tools', tr('assistant.op_delete_tools', { n: found.length }), found.map(x => x.name), { ids: found.map(x => x.id), danger: true })
    }
    case 'add_comment': {
      const task = tasks.find(x => Number(x.id) === Number(input.task_id))
      const body = text(input.text, 1000)
      if (!task || !body) return null
      return generic('add_comment', `${tr('assistant.op_add_comment')}: ${task.text}`, [body], { taskId: task.id, body })
    }
    case 'update_materials': {
      const found = (Array.isArray(input.material_ids) ? input.material_ids : []).map(id => materials.find(m => Number(m.id) === Number(id))).filter(Boolean)
      const act = ['purchased', 'needed', 'delete'].includes(input.action) ? input.action : null
      if (!found.length || !act) return null
      const title = act === 'delete' ? tr('assistant.op_update_materials_delete', { n: found.length }) : tr(`assistant.op_update_materials_${act}`)
      return generic('update_materials', title, found.map(m => `${m.name}${m.qty ? ': ' + m.qty + (m.unit ? ' ' + m.unit : '') : ''}`), { ids: found.map(m => m.id), act, danger: act === 'delete' })
    }
    case 'create_project': {
      const name = text(input.name, 100)
      if (!name) return null
      const data = {
        name, address: input.address ? text(input.address, 160) : null, deadline: DATE_RE.test(input.deadline || '') ? input.deadline : null,
        stages: (Array.isArray(input.stages) ? input.stages : []).map(x => text(x, 60)).filter(Boolean).slice(0, 30),
        zones: (Array.isArray(input.zones) ? input.zones : []).map(x => text(x, 60)).filter(Boolean).slice(0, 30),
      }
      const lines = [name]
      if (data.address) lines.push(data.address)
      if (data.deadline) lines.push(`${tr('assistant.deadline')}: ${data.deadline}`)
      if (data.zones.length) lines.push(`${tr('assistant.zones')}: ${data.zones.join(', ')}`)
      return generic('create_project', tr('assistant.op_create_project'), lines, { data })
    }
    case 'update_project': {
      const proj = project(input.project_id)
      if (!proj) return null
      const changes = {}
      if (text(input.name, 100) && text(input.name, 100) !== proj.name) changes.name = text(input.name, 100)
      if (input.address !== undefined && text(input.address, 160) !== (proj.address || '')) changes.address = text(input.address, 160) || null
      if (DATE_RE.test(input.deadline || '') && input.deadline !== proj.deadline) changes.deadline = input.deadline
      if (['active', 'completed'].includes(input.status) && input.status !== (proj.status || 'active')) changes.status = input.status
      if (!Object.keys(changes).length) return null
      return generic('update_project', `${tr('assistant.op_update_project')}: ${proj.name}`, Object.entries(changes).map(([k, v]) => `${tr(`assistant.pf_${k}`)}: ${proj[k] ?? '—'} → ${v}`), { id: proj.id, changes })
    }
    case 'delete_project': {
      const proj = project(input.project_id)
      if (!proj) return null
      const n = tasks.filter(x => Number(x.project_id) === Number(proj.id)).length
      return generic('delete_project', tr('assistant.op_delete_project', { name: proj.name }), [tr('assistant.deleteProjectNote', { n })], { id: proj.id, danger: true })
    }
    case 'set_worker_rate': {
      const w = worker(input.worker_id); const rate = num(input.rate)
      if (!w || rate === null || rate < 0 || !['hours', 'shift'].includes(input.rate_type)) return null
      return generic('set_worker_rate', `${tr('assistant.op_set_worker_rate')}: ${w.name}`,
        [`${w.default_rate || 0} / ${unitLabel(w.rate_type || 'shift')} → ${rate} / ${unitLabel(input.rate_type)}`], { workerId: w.id, rate, type: input.rate_type, danger: true })
    }
    case 'update_worker': {
      const w = worker(input.worker_id)
      if (!w) return null
      const changes = {}
      if (['on_site', 'day_off', 'sick', 'vacation', 'other'].includes(input.status) && input.status !== (w.worker_status || 'on_site')) changes.status = input.status
      if (input.phone !== undefined) changes.phone = text(input.phone, 40) || null
      if (input.telegram !== undefined) changes.telegram = text(input.telegram, 60) || null
      if (!Object.keys(changes).length) return null
      return generic('update_worker', `${tr('assistant.op_update_worker')}: ${w.name}`, Object.entries(changes).map(([k, v]) => `${tr(`assistant.wf_${k}`)}: ${v ?? '—'}`), { workerId: w.id, changes, phone: w.phone, telegram: w.telegram })
    }
    case 'add_worker_by_email': {
      const email = text(input.email, 120).toLowerCase()
      if (!/^\S+@\S+\.\S+$/.test(email)) return null
      const projs = (Array.isArray(input.project_ids) ? input.project_ids : []).map(project).filter(Boolean)
      return generic('add_worker_by_email', tr('assistant.op_add_worker_by_email'), [email, ...projs.map(p => `→ ${p.name}`)], { email, projectIds: projs.map(p => p.id) })
    }
    case 'assign_worker_to_projects': {
      const w = worker(input.worker_id)
      const projs = (Array.isArray(input.project_ids) ? input.project_ids : []).map(project).filter(Boolean)
      if (!w || !projs.length) return null
      return generic('assign_worker_to_projects', `${tr('assistant.op_assign_worker_to_projects')}: ${w.name}`, projs.map(p => `→ ${p.name}`), { workerId: w.id, projectIds: projs.map(p => p.id) })
    }
    case 'remove_worker_from_project': {
      const w = worker(input.worker_id); const proj = project(input.project_id)
      if (!w || !proj) return null
      return generic('remove_worker_from_project', tr('assistant.op_remove_worker_from_project'), [`${w.name} ← ${proj.name}`], { workerId: w.id, projectId: proj.id, danger: true })
    }
    case 'respond_join_request': {
      const r = (joinRequests || []).find(x => Number(x.id) === Number(input.request_id))
      if (!r) return null
      const approve = input.approve === true
      return generic('respond_join_request', tr('assistant.op_respond_join_request'), [`${r.worker?.name || ''}: ${tr(approve ? 'assistant.accept' : 'assistant.decline')}`], { requestId: r.id, workerId: r.worker?.id, approve, danger: !approve })
    }
    default:
      return null
  }
}

// Runs a normalized extra action. Progress is stored on the action so "try again" never repeats a finished step.
export async function applyExtra(a, photoFiles = []) {
  const st = useStore.getState()
  const err = (res) => (res && res.error ? res : null)
  const steps = async (list, fn) => {
    for (const item of list) {
      if (item.done) continue
      const bad = err(await fn(item))
      if (bad) return bad
      item.done = true
    }
    return { error: null }
  }

  switch (a.tool) {
    case 'add_expenses':
      return steps(a.items, it => st.addExpense({ project_id: a.project.id, title: it.title, amount: it.amount, currency: it.currency, category: it.category, date: it.date, notes: it.notes }, it.photoIdx !== null ? photoFiles[it.photoIdx] : null))
    case 'update_expense': return st.updateExpense(a.id, a.changes)
    case 'delete_expenses': return steps(a.ids.map(id => ({ id })), it => st.deleteExpense(it.id))
    case 'add_work_logs':
      return steps(a.entries, en => st.addWorkLog({ worker_id: en.worker_id, log_date: en.date, log_type: en.type, value: en.value, rate: en.rate, notes: en.notes, created_by: st.profile.id }))
    case 'update_work_log': return st.updateWorkLog(a.id, a.workerId, a.changes)
    case 'delete_work_logs': return steps(a.logs, l => st.deleteWorkLog(l.id, l.worker_id))
    case 'add_payments': return steps(a.payments, p => st.addPayment({ worker_id: p.worker_id, amount: p.amount, notes: p.notes, paid_at: p.date }))
    case 'delete_payments': return steps(a.payments, p => st.deletePayment(p.id, p.worker_id))
    case 'add_tool': return st.addTool(a.data)
    case 'update_tool': return st.updateTool(a.id, a.changes)
    case 'delete_tools': return steps(a.ids.map(id => ({ id })), it => st.deleteTool(it.id))
    case 'add_comment': return st.addComment(a.taskId, a.body)
    case 'update_materials':
      return steps(a.ids.map(id => ({ id })), it => (a.act === 'purchased' ? st.markMaterialPurchased(it.id) : a.act === 'needed' ? st.markMaterialNeeded(it.id) : st.deleteMaterial(it.id)))
    case 'create_project': return st.createProject(a.data)
    case 'update_project': return st.updateProject(a.id, a.changes)
    case 'delete_project': return st.deleteProject(a.id)
    case 'set_worker_rate': return st.updateMemberRate(a.workerId, a.rate, a.type)
    case 'update_worker': {
      if (a.changes.status) { const r = err(await st.updateWorkerStatus(a.workerId, a.changes.status)); if (r) return r }
      if ('phone' in a.changes || 'telegram' in a.changes) {
        return st.updateWorkerContact(a.workerId, 'phone' in a.changes ? a.changes.phone : a.phone, 'telegram' in a.changes ? a.changes.telegram : a.telegram)
      }
      return { error: null }
    }
    case 'add_worker_by_email': {
      let id = a.addedId
      if (!id) {
        const res = await st.addWorkerToTeam(a.email)
        if (res?.error) return { error: new Error(typeof res.error === 'string' ? res.error : 'add worker') }
        id = a.addedId = res.id
      }
      return steps(a.projectIds.map(pid => ({ pid })), it => st.addWorkerToProject(id, it.pid))
    }
    case 'assign_worker_to_projects': return steps(a.projectIds.map(pid => ({ pid })), it => st.addWorkerToProject(a.workerId, it.pid))
    case 'remove_worker_from_project': return st.removeWorkerFromProject(a.projectId, a.workerId)
    case 'respond_join_request':
      return a.approve ? st.approveJoinRequest(a.requestId, a.workerId) : (await st.rejectJoinRequest(a.requestId), { error: null })
    default:
      return { error: new Error('unknown action') }
  }
}
