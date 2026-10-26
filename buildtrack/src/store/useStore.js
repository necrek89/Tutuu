import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { todayStr, toLocalDateStr } from '../lib/date'
import { resolveBillingState, PLANS } from '../lib/billing'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

async function sendPush(userId, title, body, url = '/app') {
  if (!userId) return
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ user_id: userId, title, body, url }),
    })
  } catch { /* non-critical */ }
}

// ── Theme init ────────────────────────────────────────────────────────────────
const savedTheme = localStorage.getItem('tutuu_theme') || 'dark'
// apply immediately on load — dark is default, only skip if explicitly set to light
if (savedTheme !== 'light') document.documentElement.removeAttribute('data-theme')
else document.documentElement.setAttribute('data-theme', 'light')

// ── localStorage migration helper (one-time) ─────────────────────────────────
const LS_KEY = 'tutuu_materials'
function drainLocalStorage() {
  try { const s = localStorage.getItem(LS_KEY); return s ? JSON.parse(s) : [] } catch { return [] }
}

export const MATERIAL_UNITS = ['pcs', 'm', 'm²', 'm³', 'kg', 'l', 'pack', 'roll']

// Guards fetchWorkers/fetchTeam against a stale response overwriting a newer one
// when the user switches projects faster than the network round-trip.
let teamFetchSeq = 0

export const useStore = create((set, get) => ({
  user: null,
  profile: null,
  role: null,
  isLocked: false,          // true when the relevant foreman's trial has ended with no active subscription
  billingForemanId: null,   // for workers/managers: the foreman whose plan governs isLocked
  tasks: [],
  tools: [],
  projects: [],
  team: [],
  notifications: [],
  activityLog: [],
  joinRequests: [],
  roster: [], // foreman's full crew across all projects — kept separate from `team`
             // (which holds whichever single project/context was last fetched)
  materials: [],
  materialRequests: [],
  documents: [],
  expenses: [],
  workLogs: {},
  loading: false,
  selectedProjectId: null,
  setSelectedProject: (id) => set({ selectedProjectId: id }),
  pendingOpenTaskId: null,
  setPendingOpenTask: (id) => set({ pendingOpenTaskId: id }),

  searchTasks: async (query) => {
    if (!query?.trim()) return []
    const q = query.trim()
    const { data } = await supabase
      .from('tasks')
      .select('id, text, description, stage, zone, status, project_id, cost, currency, unit, quantity')
      .or(`text.ilike.%${q}%,description.ilike.%${q}%,stage.ilike.%${q}%,zone.ilike.%${q}%`)
      .limit(30)
    return data || []
  },

  // ── THEME ─────────────────────────────────────────────────
  theme: savedTheme,
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('tutuu_theme', next)
    if (next === 'light') document.documentElement.setAttribute('data-theme', 'light')
    else document.documentElement.removeAttribute('data-theme')
    set({ theme: next })
  },

  // ── AUTH ──────────────────────────────────────────────────
  signIn: async (email, password) => {
    set({ loading: true })
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { set({ loading: false }); return { error } }
    const { data: profile } = await supabase
      .from('profiles').select('*').eq('id', data.user.id).single()
    const { isLocked, billingForemanId, trialEndsAt } = await resolveBillingState(profile)
    if (trialEndsAt) profile.trial_ends_at = trialEndsAt
    set({ user: data.user, profile, role: profile.role, loading: false, isLocked, billingForemanId })
    return { error: null }
  },

  signUp: async (email, password, name, role) => {
    set({ loading: true })
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { name, role } }
    })
    if (error) { set({ loading: false }); return { error } }
    // Генерируем invite_code для прораба
    if (role === 'foreman' && data.user) {
      const code = Math.random().toString(36).substring(2, 10)
      await supabase.from('profiles').update({ invite_code: code }).eq('id', data.user.id)
    }
    set({ loading: false })
    return { error: null }
  },

  signOut: async () => {
    await supabase.auth.signOut()
    // The assistant history is private to whoever was signed in on this device
    try { Object.keys(localStorage).filter(k => k.startsWith('tutuu_assistant_')).forEach(k => localStorage.removeItem(k)) } catch { /* storage blocked */ }
    set({ user: null, profile: null, role: null, tasks: [], projects: [], tools: [], team: [], joinRequests: [], isLocked: false, billingForemanId: null })
  },

  checkSession: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: profile } = await supabase
      .from('profiles').select('*').eq('id', session.user.id).maybeSingle()
    // First Google/Apple sign-in: the handle_new_user trigger already created a
    // profile but defaulted its role to 'worker', so the real signal that the
    // user still has to pick a role is the missing role in their auth metadata
    // (email sign-up always sets it).
    const needsRole = session.user.app_metadata?.provider !== 'email' && !session.user.user_metadata?.role
    if (!profile || !profile.role || needsRole) { set({ user: session.user, profile: null, role: null }); return }
    // Если прораб без invite_code — генерируем
    if (profile?.role === 'foreman' && !profile?.invite_code) {
      const code = Math.random().toString(36).substring(2, 10)
      await supabase.from('profiles').update({ invite_code: code }).eq('id', session.user.id)
      profile.invite_code = code
    }
    const { isLocked, billingForemanId, trialEndsAt } = await resolveBillingState(profile)
    if (trialEndsAt) profile.trial_ends_at = trialEndsAt
    set({ user: session.user, profile, role: profile?.role, isLocked, billingForemanId })
  },

  fetchProfile: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: profile } = await supabase
      .from('profiles').select('*').eq('id', session.user.id).single()
    const { isLocked, billingForemanId, trialEndsAt } = await resolveBillingState(profile)
    if (trialEndsAt) profile.trial_ends_at = trialEndsAt
    set({ profile, isLocked, billingForemanId })
  },

  // ── PROJECTS ──────────────────────────────────────────────
  fetchProjects: async () => {
    const { profile, role } = get()
    let query = supabase.from('projects').select('*')
    if (role === 'foreman') {
      query = query.eq('foreman_id', profile.id)
    } else if (role === 'manager' || role === 'client') {
      const { data: pw, error: pwErr } = await supabase
        .from('project_workers').select('project_id').eq('worker_id', profile.id)
      if (pwErr) return // keep what is on screen; a failed request is not "no projects"
      const ids = (pw || []).map(r => r.project_id)
      if (!ids.length) { set({ projects: [] }); return }
      query = query.in('id', ids)
    }
    const { data, error } = await query
    if (error) return
    set({ projects: data || [] })
  },

  updateProject: async (id, updates) => {
    const { error } = await supabase.from('projects').update(updates).eq('id', id)
    if (!error) set(s => ({ projects: s.projects.map(p => p.id === id ? { ...p, ...updates } : p) }))
    return { error }
  },

  createProject: async (payload) => {
    const { profile, projects } = get()
    if (profile?.plan === 'standard') {
      const activeCount = projects.filter(p => p.status !== 'completed').length
      if (activeCount >= PLANS.standard.maxActiveProjects) return { error: 'limit_projects' }
    }
    const { error } = await supabase.from('projects').insert({ ...payload, foreman_id: profile.id, progress: 0 })
    if (!error) {
      await get().fetchProjects()
      get().logActivity({ action_type: 'project_created', entity_name: payload.name })
    }
    return { error }
  },

  // Deletes a project. Tools are the crew's equipment, not project property, so
  // they go back to stock (unassigned) instead of being deleted with the project.
  // Everything else tied to the project (tasks, documents, expenses, material
  // requests, crew links) is removed by the database together with the project row.
  // Sequenced so a failure at any step leaves the project and its data intact.
  deleteProject: async (id) => {
    const { error: toolsErr } = await supabase.from('tools')
      .update({ project_id: null, worker_id: null, assigned_at: null, assigned_by_name: null })
      .eq('project_id', id)
    if (toolsErr) return { error: toolsErr }
    const { data, error } = await supabase.from('projects').delete().eq('id', id).select('id')
    if (error) return { error }
    if (!data?.length) return { error: new Error('not deleted') } // no row removed (no permission, or already gone)
    set(s => ({
      projects: s.projects.filter(p => p.id !== id),
      tasks: s.tasks.filter(t => t.project_id !== id),
      tools: s.tools.map(t => t.project_id === id
        ? { ...t, project_id: null, worker_id: null, assigned_at: null, assigned_by_name: null } : t),
    }))
    return { error: null }
  },

  // ── TASKS ─────────────────────────────────────────────────
  fetchTasks: async (projectId) => {
    const { role, projects } = get()
    let query = supabase.from('tasks').select(`
      id, text, description, status, priority, stage, zone, start_date, deadline,
      photo_url, reject_comment, worker_id, project_id,
      quantity, unit, cost, currency,
      worker:profiles(id, name)
    `)
    if (projectId) {
      query = query.eq('project_id', projectId)
    } else if (role === 'foreman') {
      const ids = projects.map(p => p.id)
      if (!ids.length) { set({ tasks: [] }); return }
      query = query.in('project_id', ids)
    } else if (role === 'manager') {
      const ids = projects.map(p => p.id)
      if (!ids.length) { set({ tasks: [] }); return }
      query = query.in('project_id', ids)
    }
    const { data, error } = await query.order('created_at', { ascending: false })
    if (error) return
    if (projectId) {
      // Merge: replace only tasks for this project, keep others intact
      const others = get().tasks.filter(t => t.project_id !== projectId)
      set({ tasks: [...others, ...(data || [])] })
    } else {
      set({ tasks: data || [] })
    }
  },

  // Recalculate project progress = approved / total * 100 (auto, no manual slider)
  recalcProgress: async (projectId) => {
    if (!projectId) return
    const all = get().tasks.filter(t => t.project_id === projectId)
    if (!all.length) return
    const approved = all.filter(t => t.status === 'approved').length
    const pct = Math.round((approved / all.length) * 100)
    await get().updateProject(projectId, { progress: pct })
  },

  addTask: async (task) => {
    const { data, error } = await supabase.from('tasks').insert(task).select().single()
    if (!error) {
      set(s => ({ tasks: [data, ...s.tasks] }))
      get().logActivity({ action_type: 'task_created', entity_name: task.text, entity_id: String(data.id), project_id: task.project_id })
      get().recalcProgress(task.project_id)
      if (task.worker_id && task.worker_id !== get().profile?.id) {
        sendPush(task.worker_id, 'New task assigned', task.text, '/app')
      }
    }
    return { data, error }
  },

  updateTask: async (id, updates) => {
    const { error } = await supabase.from('tasks').update(updates).eq('id', id)
    if (!error) set(s => ({ tasks: s.tasks.map(t => t.id === id ? { ...t, ...updates } : t) }))
    return { error }
  },

  deleteTask: async (id) => {
    const task = get().tasks.find(t => t.id === id)
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (!error) {
      set(s => ({ tasks: s.tasks.filter(t => t.id !== id) }))
      if (task?.project_id) get().recalcProgress(task.project_id)
    }
    return { error }
  },

  _setTaskStatus: async (id, status, actionType, extra = {}) => {
    const task = get().tasks.find(t => t.id === id)
    const result = await get().updateTask(id, { status, ...extra })
    if (!result?.error && task) {
      get().logActivity({ action_type: actionType, entity_name: task.text, entity_id: String(id), project_id: task.project_id })
      get().recalcProgress(task.project_id)
    }
    return result
  },

  submitTask:  (id) => get()._setTaskStatus(id, 'pending', 'task_submitted'),
  approveTask: (id) => get()._setTaskStatus(id, 'approved', 'task_approved'),
  rejectTask:  (id, comment) => get()._setTaskStatus(id, 'rejected', 'task_rejected', { reject_comment: comment }),

  // ── TOOLS ─────────────────────────────────────────────────
  fetchTools: async (projectId) => {
    const { profile, role, projects } = get()
    let query = supabase.from('tools').select('*')
    if (projectId) {
      query = query.eq('project_id', projectId)
    } else if (role === 'foreman') {
      query = query.eq('foreman_id', profile.id)
    } else if (role === 'manager') {
      const ids = projects.map(p => p.id)
      if (!ids.length) { set({ tools: [] }); return }
      query = query.in('project_id', ids)
    } else if (role === 'worker') {
      // Worker sees only tools from projects they belong to
      const { data: pw, error: pwErr } = await supabase.from('project_workers').select('project_id').eq('worker_id', profile.id)
      if (pwErr) return
      const ids = (pw || []).map(r => r.project_id)
      if (!ids.length) { set({ tools: [] }); return }
      query = query.in('project_id', ids)
    }
    const { data, error } = await query
    if (error) return
    set({ tools: data || [] })
  },

  addTool: async (tool) => {
    const { profile } = get()
    const payload = { name: tool.name, status: tool.status || 'active', foreman_id: profile?.id }
    if (tool.location)   payload.location   = tool.location
    if (tool.project_id) payload.project_id = tool.project_id
    if (tool.worker_id)  payload.worker_id  = tool.worker_id
    const { data, error } = await supabase.from('tools').insert(payload).select().single()
    if (!error) {
      set(s => ({ tools: [data, ...s.tools] }))
      get().logActivity({ action_type: 'tool_added', entity_name: tool.name, entity_id: String(data.id), project_id: tool.project_id || null })
    }
    return { error }
  },

  updateTool: async (id, updates) => {
    const { data, error } = await supabase.from('tools').update(updates).eq('id', id).select().single()
    if (!error) set(s => ({ tools: s.tools.map(t => t.id === id ? data : t) }))
    return { error }
  },

  deleteTool: async (id) => {
    const { error } = await supabase.from('tools').delete().eq('id', id)
    if (!error) set(s => ({ tools: s.tools.filter(t => t.id !== id) }))
    return { error }
  },

  // ── TEAM ──────────────────────────────────────────────────
  fetchTeam: async (projectId) => {
    await get().fetchWorkers(projectId)
  },

  fetchWorkers: async (projectId) => {
    const reqId = ++teamFetchSeq
    const { data, error } = await supabase
      .from('project_workers')
      .select('worker:profiles(id, name, role, worker_status, phone, telegram, default_rate, rate_type)')
      .eq('project_id', projectId)
    if (error) return get().team
    const workers = data?.map(d => d.worker) || []
    if (reqId === teamFetchSeq) set({ team: workers })
    return workers
  },

  // Shared query behind fetchAllWorkers/fetchRoster: every worker across the
  // foreman's projects (Source 1) plus approved join_requests (Source 2 —
  // catches crew members who joined but aren't assigned to any project yet)
  _buildRoster: async () => {
    const { profile, projects } = get()
    const map = {}

    // Source 1: via project_workers
    if (projects.length) {
      const { data, error } = await supabase
        .from('project_workers')
        .select('worker:profiles(id, name, role, worker_status, phone, telegram, default_rate, rate_type), project_id')
        .in('project_id', projects.map(p => p.id))
      if (error) return null
      for (const row of data || []) {
        const w = row.worker
        if (!w) continue
        if (!map[w.id]) map[w.id] = { ...w, project_ids: [] }
        map[w.id].project_ids.push(row.project_id)
      }
    }

    // Source 2: via approved join_requests (catches workers added before any project existed)
    if (profile?.role === 'foreman') {
      // Step 1: get worker_ids from approved requests
      const { data: reqData, error: reqErr } = await supabase
        .from('join_requests')
        .select('worker_id')
        .eq('foreman_id', profile.id)
        .eq('status', 'approved')
      if (reqErr) return null
      const workerIds = (reqData || []).map(r => r.worker_id).filter(id => id && !map[id])
      // Step 2: fetch profiles for those workers
      if (workerIds.length) {
        const { data: profData, error: profErr } = await supabase
          .from('profiles')
          .select('id, name, role, worker_status, phone, telegram, default_rate, rate_type')
          .in('id', workerIds)
        if (profErr) return null
        for (const w of profData || []) {
          if (!map[w.id]) map[w.id] = { ...w, project_ids: [] }
        }
      }
    }

    return Object.values(map)
  },

  // Fetch all unique workers across all foreman's projects, with project membership
  fetchAllWorkers: async () => {
    const workers = await get()._buildRoster()
    if (!workers) return get().team // request failed: keep the list that is already shown
    set({ team: workers })
    return workers
  },

  // Same data as fetchAllWorkers, written to `roster` instead of `team` — lets a
  // project-scoped view (ProjectTeamTab) keep `team` as just that project's
  // members while still having the full crew available to pick from when adding.
  fetchRoster: async () => {
    const workers = await get()._buildRoster()
    if (!workers) return get().roster
    set({ roster: workers })
    return workers
  },

  // Unassign a worker/manager/client from a single project (project_workers row only —
  // their profile, other project memberships and existing task assignments are untouched)
  removeWorkerFromProject: async (projectId, workerId) => {
    await supabase.from('project_workers').delete().eq('project_id', projectId).eq('worker_id', workerId)
    set(s => ({ team: s.team.filter(m => m.id !== workerId) }))
  },

  // Add a worker to the foreman's crew without assigning them to any project yet
  // (via an approved join_requests row — the same relationship a worker gets by
  // sending a join request and having it accepted). Assign to actual project(s)
  // separately with addWorkerToProject.
  addWorkerToTeam: async (email) => {
    const { profile } = get()
    if (profile?.plan === 'standard') {
      const roster = (await get()._buildRoster()) || []
      if (roster.length >= PLANS.standard.maxWorkers) return { error: 'limit_workers' }
    }
    // Profiles of strangers are not readable; a server function finds one person by exact email
    const { data: found, error } = await supabase.rpc('find_profile_by_email', { p_email: email })
    const worker = found?.[0]
    if (error || !worker) return { error: 'User not found. Ask them to register first.' }
    if (worker.role !== 'worker') return { error: 'This user is not registered as a Worker.' }
    const { error: insErr } = await supabase.from('join_requests')
      .insert({ foreman_id: profile.id, worker_id: worker.id, status: 'approved' })
    if (insErr) {
      if (insErr.code === '23505') {
        // Already linked (pending request or previously approved) — make sure it's approved
        await supabase.from('join_requests').update({ status: 'approved' })
          .eq('foreman_id', profile.id).eq('worker_id', worker.id)
      } else {
        return { error: insErr.message }
      }
    }
    get().logActivity({ action_type: 'worker_joined', entity_name: worker.name, entity_id: worker.id })
    return { error: null, id: worker.id, name: worker.name }
  },

  // Assign an existing crew member (or anyone with a profile) to one specific project
  addWorkerToProject: async (workerId, projectId) => {
    const { error } = await supabase.from('project_workers').insert({ project_id: projectId, worker_id: workerId })
    if (error) return { error: error.code === '23505' ? 'Already on this project.' : error.message }
    return { error: null }
  },

  // Update a profiles row and patch the matching entry in the local team array
  _patchTeamMember: async (workerId, patch) => {
    await supabase.from('profiles').update(patch).eq('id', workerId)
    set(s => ({ team: s.team.map(m => m.id === workerId ? { ...m, ...patch } : m) }))
  },

  updateWorkerStatus: (workerId, status) => get()._patchTeamMember(workerId, { worker_status: status }),

  updateWorkerContact: (workerId, phone, telegram) =>
    get()._patchTeamMember(workerId, { phone: phone || null, telegram: telegram || null }),

  // ── JOIN REQUESTS ─────────────────────────────────────────
  // Рабочий отправляет заявку прорабу по invite_code
  sendJoinRequest: async (inviteCode) => {
    const { profile } = get()
    // Найти прораба по коду
    const { data: foundForeman, error: fErr } = await supabase.rpc('find_foreman_by_code', { p_code: inviteCode })
    const foreman = foundForeman?.[0]
    if (fErr || !foreman) return { error: 'Foreman not found. Check the code.' }
    if (foreman.role !== 'foreman') return { error: 'This code does not belong to a foreman.' }
    if (foreman.id === profile.id) return { error: 'You cannot join yourself.' }
    // Создать заявку
    const { error } = await supabase.from('join_requests').insert({
      foreman_id: foreman.id,
      worker_id: profile.id,
    })
    if (error) {
      if (error.code === '23505') return { error: 'Request already sent.' }
      return { error: error.message }
    }
    sendPush(foreman.id, 'New join request', `${profile.name} wants to join your crew`, '/app')
    return { error: null, foremanName: foreman.name }
  },

  // Прораб получает список заявок
  fetchJoinRequests: async () => {
    const { profile } = get()
    const { data, error } = await supabase
      .from('join_requests')
      .select(`
        id, status, created_at,
        worker:profiles!join_requests_worker_id_fkey(id, name, email, role)
      `)
      .eq('foreman_id', profile.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    if (error) return
    set({ joinRequests: data || [] })
  },

  // Прораб одобряет заявку — только присоединяет к бригаде, без привязки к
  // проектам. Прораб назначает на конкретные проекты отдельно, через
  // "+ Add" на вкладке Team внутри каждого проекта.
  approveJoinRequest: async (requestId, workerId) => {
    const { joinRequests, profile } = get()
    if (profile?.plan === 'standard') {
      const roster = (await get()._buildRoster()) || []
      if (roster.length >= PLANS.standard.maxWorkers) return { error: 'limit_workers' }
    }
    const req = joinRequests.find(r => r.id === requestId)
    const workerName = req?.worker?.name || 'Unknown'

    await supabase.from('join_requests').update({ status: 'approved' }).eq('id', requestId)
    set(s => ({ joinRequests: s.joinRequests.filter(r => r.id !== requestId) }))
    get().logActivity({ action_type: 'worker_joined', entity_name: workerName, entity_id: workerId })
    sendPush(workerId, 'Request approved', `${profile.name} added you to the crew`, '/app')
    return { error: null }
  },

  // Прораб отклоняет заявку
  rejectJoinRequest: async (requestId) => {
    await supabase.from('join_requests').update({ status: 'rejected' }).eq('id', requestId)
    set(s => ({ joinRequests: s.joinRequests.filter(r => r.id !== requestId) }))
  },

  addManagerToTeam: async (email) => {
    const { projects: allProjects } = get()
    const { data: foundMgr, error } = await supabase.rpc('find_profile_by_email', { p_email: email })
    const mgr = foundMgr?.[0]
    if (error || !mgr) return { error: 'User not found. Ask them to register first.' }
    if (mgr.role !== 'manager') return { error: 'This user is not registered as a Manager.' }
    if (!allProjects.length) return { error: 'Create at least one project first.' }
    const inserts = allProjects.map(p => ({ project_id: p.id, worker_id: mgr.id }))
    const { error: e2 } = await supabase.from('project_workers').insert(inserts)
    if (e2) return { error: e2.code === '23505' ? 'Manager already in team.' : e2.message }
    get().logActivity({ action_type: 'worker_joined', entity_name: mgr.name, entity_id: mgr.id })
    return { error: null, name: mgr.name }
  },

  // ── MATERIAL REQUESTS (Supabase) ─────────────────────
  fetchMaterialRequests: async (projectId) => {
    const { profile, role, projects } = get()
    if (!profile) return
    let query = supabase
      .from('material_requests')
      .select('*, task:tasks(text), project:projects(name)')
      .order('created_at', { ascending: false })
    if (role === 'worker') {
      query = query.eq('worker_id', profile.id)
    } else if (projectId) {
      query = query.eq('project_id', projectId)
    } else {
      // No specific project — scope to this user's own accessible projects
      const ids = projects.map(p => p.id)
      if (!ids.length) { set({ materialRequests: [] }); return }
      query = query.in('project_id', ids)
    }
    const { data, error } = await query
    if (error) return
    set({ materialRequests: data || [] })
  },

  // Uploads a file to the shared task-photos bucket and returns its public URL, or null on failure
  _uploadToBucket: async (path, file, options) => {
    const { error } = await supabase.storage.from('task-photos').upload(path, file, options)
    if (error) return null
    const { data } = supabase.storage.from('task-photos').getPublicUrl(path)
    return data.publicUrl
  },

  addMaterialRequest: async (payload, photoFile) => {
    const { profile } = get()
    let photo_url = null
    if (photoFile) {
      const ext = photoFile.name.split('.').pop()
      const path = `material-requests/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      photo_url = await get()._uploadToBucket(path, photoFile)
    }
    const { data, error } = await supabase
      .from('material_requests')
      .insert({ ...payload, worker_id: profile.id, worker_name: profile.name, photo_url })
      .select('*, task:tasks(text), project:projects(name)')
      .single()
    if (!error && data) {
      set(s => ({ materialRequests: [data, ...s.materialRequests] }))
    }
    return { error }
  },

  updateMaterialRequestStatus: async (id, status) => {
    const { error } = await supabase
      .from('material_requests')
      .update({ status })
      .eq('id', id)
    if (!error) {
      set(s => ({
        materialRequests: s.materialRequests.map(r => r.id === id ? { ...r, status } : r)
      }))
    }
  },

  deleteMaterialRequest: async (id) => {
    await supabase.from('material_requests').delete().eq('id', id)
    set(s => ({ materialRequests: s.materialRequests.filter(r => r.id !== id) }))
  },

  // ── MATERIALS ────────────────────────────────────────────
  // Helper: map Supabase row → store shape
  _matRow: (m) => ({
    id:          m.id,
    projectId:   m.project_id,
    taskId:      m.task_id,
    name:        m.name,
    qty:         m.qty,
    unit:        m.unit,
    note:        m.note,
    reportedBy:  m.reported_by,
    reportedById: m.reported_by_id,
    status:      m.status,
    createdAt:   m.created_at,
    purchasedAt: m.purchased_at,
  }),

  fetchMaterials: async () => {
    const { profile, _matRow } = get()
    if (!profile) return

    // One-time migration from localStorage
    const lsData = drainLocalStorage()
    if (lsData.length) {
      const rows = lsData.map(m => ({
        foreman_id:  profile.id,
        project_id:  m.projectId || null,
        name:        m.name,
        qty:         m.qty || 1,
        unit:        m.unit || 'pcs',
        note:        m.note || null,
        reported_by: m.reportedBy || profile.name,
        status:      m.status || 'needed',
        created_at:  m.createdAt || new Date().toISOString(),
        purchased_at: m.purchasedAt || null,
      }))
      await supabase.from('materials').insert(rows)
      localStorage.removeItem(LS_KEY)
    }

    const { data } = await supabase
      .from('materials')
      .select('*')
      .eq('foreman_id', profile.id)
      .order('created_at', { ascending: false })
    set({ materials: (data || []).map(_matRow) })
  },

  addMaterial: async (material) => {
    const { profile, _matRow } = get()
    const { data, error } = await supabase.from('materials').insert({
      foreman_id:  profile.id,
      project_id:  material.projectId || null,
      task_id:     material.taskId    || null,
      name:        material.name,
      qty:         material.qty  || 1,
      unit:        material.unit || 'pcs',
      note:        material.note || null,
      reported_by: material.reportedBy || profile?.name,
      reported_by_id: profile?.id || null,
      status:      'needed',
    }).select().single()
    if (!error && data) {
      set(s => ({ materials: [_matRow(data), ...s.materials] }))
      get().logActivity({ action_type: 'material_added', entity_name: material.name, project_id: material.projectId || null, meta: { qty: material.qty, unit: material.unit } })
    }
    return { error }
  },

  markMaterialPurchased: async (id) => {
    const material = get().materials.find(m => m.id === id)
    const now = new Date().toISOString()
    await supabase.from('materials').update({ status: 'purchased', purchased_at: now }).eq('id', id)
    set(s => ({ materials: s.materials.map(m => m.id === id ? { ...m, status: 'purchased', purchasedAt: now } : m) }))
    if (material) get().logActivity({ action_type: 'material_purchased', entity_name: material.name, project_id: material.projectId || null })
  },

  markMaterialNeeded: async (id) => {
    await supabase.from('materials').update({ status: 'needed', purchased_at: null }).eq('id', id)
    set(s => ({ materials: s.materials.map(m => m.id === id ? { ...m, status: 'needed', purchasedAt: null } : m) }))
  },

  deleteMaterial: async (id) => {
    await supabase.from('materials').delete().eq('id', id)
    set(s => ({ materials: s.materials.filter(m => m.id !== id) }))
  },

  getProjectMaterials: (projectId) => get().materials.filter(m => m.projectId === projectId),
  getTaskMaterials:    (taskId)     => get().materials.filter(m => m.taskId    === taskId),
  getOpenShortages:    ()           => get().materials.filter(m => m.status === 'needed'),

  // ── NOTIFICATIONS ─────────────────────────────────────────
  fetchNotifications: async () => {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) return
    set({ notifications: data || [] })
  },

  markNotifRead: async (id) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id)
    set(s => ({ notifications: s.notifications.map(n => n.id === id ? { ...n, read: true } : n) }))
  },

  // ── ACTIVITY LOG ──────────────────────────────────────────
  logActivity: async ({ action_type, entity_name, entity_id, project_id, meta }) => {
    const { profile } = get()
    if (!profile) return
    try {
      await supabase.from('activity_log').insert({
        actor_id:    profile.id,
        actor_name:  profile.name || 'Unknown',
        action_type,
        entity_name: entity_name || null,
        entity_id:   entity_id ? String(entity_id) : null,
        project_id:  project_id || null,
        meta:        meta || null,
      })
    } catch (_) { /* silent — log failures never break the app */ }
  },

  fetchActivityLog: async () => {
    const { profile, role, projects } = get()
    let query = supabase.from('activity_log').select('*, project:projects(name)').order('created_at', { ascending: false }).limit(200)
    if (role === 'foreman') {
      // Foreman sees only activity from their own projects
      const ids = projects.map(p => p.id)
      if (!ids.length) { set({ activityLog: [] }); return }
      query = query.in('project_id', ids)
    } else if (role === 'worker') {
      // Worker sees only activity from their assigned projects
      const { data: pw, error: pwErr } = await supabase.from('project_workers').select('project_id').eq('worker_id', profile.id)
      if (pwErr) return
      const ids = (pw || []).map(r => r.project_id)
      if (!ids.length) { set({ activityLog: [] }); return }
      query = query.in('project_id', ids)
    } else if (role === 'manager') {
      // Manager sees activity from the linked foreman's projects
      const ids = projects.map(p => p.id)
      if (!ids.length) { set({ activityLog: [] }); return }
      query = query.in('project_id', ids)
    }
    const { data, error } = await query
    if (error) return
    set({ activityLog: data || [] })
  },

  // ── TASK COMMENTS ─────────────────────────────────────────────────
  fetchComments: async (taskId) => {
    const { data } = await supabase
      .from('task_comments')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true })
    return data || []
  },

  addComment: async (taskId, text) => {
    const { profile, tasks } = get()
    if (!profile) return { error: 'Not authenticated' }
    const { data, error } = await supabase
      .from('task_comments')
      .insert({
        task_id:     taskId,
        author_id:   profile.id,
        author_name: profile.name || 'Unknown',
        text:        text.trim(),
      })
      .select()
      .single()
    if (!error) {
      const task = tasks.find(t => t.id === taskId || t.id === Number(taskId))
      get().logActivity({ action_type: 'comment_added', entity_name: task?.text || null, entity_id: String(taskId), project_id: task?.project_id || null })
    }
    return { data, error }
  },
  // ── EXPENSES ─────────────────────────────────────────────────────────────────
  fetchExpenses: async (projectId) => {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('project_id', projectId)
      .order('date', { ascending: false })
    if (error) return
    set({ expenses: data || [] })
  },

  addExpense: async (expense, receiptFile) => {
    const { profile } = get()
    let receipt_url = null

    if (receiptFile) {
      const ext  = receiptFile.name.split('.').pop()
      const path = `receipts/${expense.project_id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      receipt_url = await get()._uploadToBucket(path, receiptFile, { upsert: true })
    }

    const { data, error } = await supabase
      .from('expenses')
      .insert({ ...expense, foreman_id: profile?.id, receipt_url })
      .select()
      .single()
    if (!error && data) set(s => ({ expenses: [data, ...s.expenses] }))
    return { data, error }
  },

  updateExpense: async (id, updates, newReceiptFile) => {
    let receipt_url = updates.receipt_url
    if (newReceiptFile) {
      const ext  = newReceiptFile.name.split('.').pop()
      const path = `receipts/edit/${id}_${Date.now()}.${ext}`
      const url = await get()._uploadToBucket(path, newReceiptFile, { upsert: true })
      if (url) receipt_url = url
    }
    const { data, error } = await supabase
      .from('expenses')
      .update({ ...updates, receipt_url })
      .eq('id', id)
      .select()
      .single()
    if (!error && data) set(s => ({ expenses: s.expenses.map(e => e.id === id ? data : e) }))
    return { data, error }
  },

  deleteExpense: async (id) => {
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (!error) set(s => ({ expenses: s.expenses.filter(e => e.id !== id) }))
    return { error }
  },

  // ── DOCUMENTS ────────────────────────────────────────────────────────────────
  fetchDocuments: async (projectId) => {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    if (error) return
    set({ documents: data || [] })
  },

  addDocument: async (doc) => {
    const { data, error } = await supabase.from('documents').insert(doc).select().single()
    if (!error && data) set(s => ({ documents: [data, ...s.documents] }))
    return { data, error }
  },

  deleteDocument: async (id) => {
    const { error } = await supabase.from('documents').delete().eq('id', id)
    if (!error) set(s => ({ documents: s.documents.filter(d => d.id !== id) }))
    return { error }
  },

  // ── Work Logs ─────────────────────────────────────────────────────────────
  fetchWorkLogs: async (workerId) => {
    const { data, error } = await supabase
      .from('work_logs')
      .select('*, project:projects(name)')
      .eq('worker_id', workerId)
      .order('log_date', { ascending: false })
    if (!error) set(s => ({ workLogs: { ...s.workLogs, [workerId]: data || [] } }))
  },

  addWorkLog: async (payload) => {
    const { data, error } = await supabase.from('work_logs').insert(payload).select('*, project:projects(name)').single()
    if (!error && data) {
      set(s => ({
        workLogs: {
          ...s.workLogs,
          [payload.worker_id]: [data, ...(s.workLogs[payload.worker_id] || [])]
        }
      }))
    }
    return { data, error }
  },

  deleteWorkLog: async (logId, workerId) => {
    const { error } = await supabase.from('work_logs').delete().eq('id', logId)
    if (!error) {
      set(s => ({
        workLogs: {
          ...s.workLogs,
          [workerId]: (s.workLogs[workerId] || []).filter(l => l.id !== logId)
        }
      }))
    }
  },

  updateWorkLog: async (logId, workerId, payload) => {
    const { error } = await supabase.from('work_logs').update(payload).eq('id', logId)
    if (!error) {
      set(s => ({
        workLogs: {
          ...s.workLogs,
          [workerId]: (s.workLogs[workerId] || []).map(l => l.id === logId ? { ...l, ...payload } : l)
        }
      }))
    }
  },

  fetchWorkLogsByDate: async (date) => {
    const { projects } = get()
    if (!projects.length) return []
    const { data: pwRows } = await supabase
      .from('project_workers')
      .select('worker_id')
      .in('project_id', projects.map(p => p.id))
    const workerIds = [...new Set((pwRows || []).map(r => r.worker_id))]
    if (!workerIds.length) return []
    const { data } = await supabase
      .from('work_logs')
      .select('*')
      .in('worker_id', workerIds)
      .eq('log_date', date)
    return data || []
  },

  // ── Worker payments ───────────────────────────────────────────────────────
  payments: {},  // keyed by workerId

  fetchPayments: async (workerId) => {
    const { data, error } = await supabase
      .from('worker_payments')
      .select('*')
      .eq('worker_id', workerId)
      .order('paid_at', { ascending: false })
    if (error) return get().payments[workerId] || []
    set(s => ({ payments: { ...s.payments, [workerId]: data || [] } }))
    return data || []
  },

  addPayment: async ({ worker_id, amount, notes, paid_at }) => {
    const { profile } = get()
    const { data, error } = await supabase.from('worker_payments').insert({
      worker_id, foreman_id: profile?.id,
      amount: parseFloat(amount) || 0,
      notes: notes || null,
      paid_at: paid_at || todayStr(),
    }).select().single()
    if (error) return { error: error.message }
    set(s => ({ payments: { ...s.payments, [worker_id]: [data, ...(s.payments[worker_id] || [])] } }))
    const sym = currencySymbol(get().profile?.currency)
    sendPush(worker_id, 'Payment received', `${sym}${parseFloat(amount).toLocaleString()} from ${get().profile?.name}`, '/app')
    return { data }
  },

  deletePayment: async (id, workerId) => {
    await supabase.from('worker_payments').delete().eq('id', id)
    set(s => ({ payments: { ...s.payments, [workerId]: (s.payments[workerId] || []).filter(p => p.id !== id) } }))
  },

  updateMemberRate: (workerId, defaultRate, rateType) =>
    get()._patchTeamMember(workerId, { default_rate: defaultRate, rate_type: rateType }),

  // ── Attendance ────────────────────────────────────────────────────────────
  attendance: [],

  fetchAttendance: async (date) => {
    const dateStr = date || todayStr()
    const { data, error } = await supabase.from('attendance').select('*').eq('date', dateStr)
    if (error) return
    set({ attendance: data || [] })
  },

  saveAttendance: async (records) => {
    const { profile } = useStore.getState()
    if (!profile) return { error: 'No profile' }
    const rows = records.map(r => ({
      foreman_id: profile.id,
      worker_id: r.worker_id,
      date: r.date,
      status: r.status,
      arrived_at: r.arrived_at || null,
      note: r.note || null,
    }))
    const { error } = await supabase.from('attendance').upsert(rows, { onConflict: 'worker_id,date' })
    if (!error) set({ attendance: rows })
    return { error }
  },

  copyYesterdayAttendance: async () => {
    const today = todayStr()
    const yesterday = toLocalDateStr(new Date(Date.now() - 86400000))
    const { data } = await supabase.from('attendance').select('*').eq('date', yesterday)
    const { profile } = useStore.getState()
    if (!data || data.length === 0) return false
    const rows = data.map(r => ({
      foreman_id: profile.id,
      worker_id: r.worker_id,
      date: today,
      status: r.status,
      arrived_at: null,
      note: null,
    }))
    await supabase.from('attendance').upsert(rows, { onConflict: 'worker_id,date' })
    set({ attendance: rows })
    return true
  },
}))

// Central lockout guard: wraps every create/edit/delete action so a foreman
// whose trial has ended with no active subscription (or a worker/manager
// under such a foreman) can't mutate anything, without threading a flag
// through every component that calls these. Read-only actions (fetch*) are
// deliberately not in this list — the soft lockout keeps all data visible.
const MUTATING_ACTIONS = [
  'createProject', 'updateProject', 'deleteProject',
  'addTask', 'updateTask', 'deleteTask', 'submitTask', 'approveTask', 'rejectTask',
  'addTool', 'updateTool', 'deleteTool',
  'removeWorkerFromProject', 'addWorkerToTeam', 'addWorkerToProject',
  'updateWorkerStatus', 'updateWorkerContact',
  'approveJoinRequest', 'rejectJoinRequest', 'addManagerToTeam',
  'addMaterialRequest', 'updateMaterialRequestStatus', 'deleteMaterialRequest',
  'addMaterial', 'markMaterialPurchased', 'markMaterialNeeded', 'deleteMaterial',
  'addComment',
  'addExpense', 'updateExpense', 'deleteExpense',
  'addDocument', 'deleteDocument',
  'addWorkLog', 'deleteWorkLog', 'updateWorkLog',
  'addPayment', 'deletePayment', 'updateMemberRate',
  'saveAttendance', 'copyYesterdayAttendance',
]
const guardedActions = {}
for (const name of MUTATING_ACTIONS) {
  const original = useStore.getState()[name]
  guardedActions[name] = (...args) => {
    if (useStore.getState().isLocked) return Promise.resolve({ error: 'locked' })
    return original(...args)
  }
}
useStore.setState(guardedActions)

export const STAGES = ['Foundation', 'Electrical', 'Walls', 'Roofing', 'Finishing']
export const PRIORITY_OPTIONS = [
  { value: 'high',   label: 'High'   },
  { value: 'normal', label: 'Normal' },
  { value: 'low',    label: 'Low'    },
]
export const PRIORITY_BADGE = { high: 'red', normal: 'blue', low: 'gray' }
export const PRIORITY_LABEL = { high: 'High', normal: 'Normal', low: 'Low' }
export const TOOL_STATUS_BADGE  = { active: 'blue', stored: 'green', lost: 'red' }
export const TOOL_STATUS_LABEL  = { active: 'On Site', stored: 'In Storage', lost: 'Lost' }
export const STATUS_LABEL = { new: 'New', pending: 'In Review', approved: 'Completed', rejected: 'Revision' }
export const STATUS_BADGE = { new: 'gray', pending: 'amber', approved: 'green', rejected: 'red' }

// Returns the currency symbol for the current profile's currency code
export function currencySymbol(code) {
  const map = { USD:'$', EUR:'€', GBP:'£', RUB:'₽', AED:'د.إ', TRY:'₺', KZT:'₸', UAH:'₴', UZS:'сум', CNY:'¥', GEL:'₾', AMD:'֏', AZN:'₼' }
  return map[code] || code || '$'
}