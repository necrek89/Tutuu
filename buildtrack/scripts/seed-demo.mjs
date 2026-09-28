#!/usr/bin/env node
// Seeds (or removes) a single self-contained demo project for investor
// screenshots/pitch: "Demo: 3-room apartment renovation".
//
// Safety model:
//  - Everything created here is either scoped to that one project_id, or is
//    a fresh auth user on an @example.com address tagged demo:true in its
//    metadata. Nothing that already existed is ever touched.
//  - Idempotent: re-running deletes the demo project + demo users (by their
//    fixed emails) first, then recreates everything from scratch. There is
//    no partial/merge state.
//  - --dry-run never touches the network — it only prints what a real run
//    would create, from the exact same data-generation code.
//  - --remove deletes the demo project/users and exits — it does not
//    recreate anything.
//
// Usage:
//   node scripts/seed-demo.mjs --dry-run   # print the plan, touch nothing
//   node scripts/seed-demo.mjs             # delete-if-exists, then create
//   node scripts/seed-demo.mjs --remove    # delete only
//
// Required in buildtrack/.env.local (never committed):
//   SUPABASE_SERVICE_ROLE_KEY=...
//   DEMO_OWNER_ID=<uuid of the foreman profile that should own the project>
// VITE_SUPABASE_URL is reused from the regular .env (it's already public).

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// ── tiny .env loader (no new dependency) ────────────────────────────────────
function loadEnvFile(file) {
  if (!existsSync(file)) return {}
  const out = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
    if (!m) continue
    let val = m[2]
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    out[m[1]] = val
  }
  return out
}

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const REMOVE_ONLY = args.includes('--remove')

const env = { ...loadEnvFile(path.join(ROOT, '.env')), ...loadEnvFile(path.join(ROOT, '.env.local')) }

const PROJECT_NAME = 'Demo: 3-room apartment renovation'
const DEMO_TAG = { demo: true }
const DEMO_EMAILS = {
  worker1: 'demo.worker1@example.com',
  worker2: 'demo.worker2@example.com',
  worker3: 'demo.worker3@example.com',
  worker4: 'demo.worker4@example.com',
  client1: 'demo.client1@example.com',
}

// ── date helpers — everything relative to "today", never hardcoded ─────────
const DAY = 86400000
const today = new Date()
today.setHours(12, 0, 0, 0) // avoid TZ edge cases when only the date part is used
const isoDate = (d) => d.toISOString().slice(0, 10)
const daysAgo = (n) => new Date(today.getTime() - n * DAY)
const daysFromNow = (n) => new Date(today.getTime() + n * DAY)
// Walks back from today skipping weekends — used for attendance/work_logs.
function lastWorkdays(n) {
  const out = []
  let d = new Date(today)
  while (out.length < n) {
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) out.push(new Date(d))
    d = new Date(d.getTime() - DAY)
  }
  return out.reverse()
}

// ═════════════════════════════════════════════════════════════════════════
// DATA PLAN — pure functions, no network. Same code powers --dry-run and
// the real run, so the printed plan can never drift from what's inserted.
// ═════════════════════════════════════════════════════════════════════════

const ZONES = ['Corridor', 'Kitchen', 'Bathroom', 'Living room', 'Balcony']
const STAGES = ['Demolition', 'Plastering', 'Electrical', 'Tiling', 'Painting', 'Cleaning']

const WORKERS = [
  { key: 'worker1', name: 'Mateo Alvarez',  role: 'worker', trade: 'tiling/electrical',  default_rate: 28, rate_type: 'hours' },
  { key: 'worker2', name: 'Jakub Nowak',     role: 'worker', trade: 'plastering/painting', default_rate: 24, rate_type: 'hours' },
  { key: 'worker3', name: 'Liam OConnor',    role: 'worker', trade: 'electrical',         default_rate: 30, rate_type: 'hours' },
  { key: 'worker4', name: 'Noah Fischer',    role: 'worker', trade: 'general/cleaning',   default_rate: 20, rate_type: 'shift' },
]
const CLIENT = { key: 'client1', name: 'Sophia Reyes', role: 'client' }

// bucket -> {status, assigned} — "in_progress" and "not_started" are both
// schema status 'new'; the app has no separate in-progress status, so we
// distinguish them by whether a worker is assigned (visible via the avatar
// on the task card).
const BUCKET = {
  done:         { status: 'approved', assigned: true },
  in_progress:  { status: 'new',      assigned: true },
  review:       { status: 'pending',  assigned: true },
  not_started:  { status: 'new',      assigned: false },
}

// [zone, stage, text, qty, unit, unitPrice, bucket]
const TASK_ROWS = [
  // Corridor — the "can bring the electrician in" story from the brief
  ['Corridor', 'Demolition', 'Strip old wallpaper and baseboards', 12, 'm²', 4, 'done'],
  ['Corridor', 'Plastering', 'Plaster and level corridor walls', 12, 'm²', 9, 'done'],
  ['Corridor', 'Electrical', 'Run wiring for hallway outlets and light switch', 1, 'set', 180, 'in_progress'],
  ['Corridor', 'Tiling',     'Lay porcelain tile flooring', 10, 'm²', 22, 'not_started'],

  // Bathroom — almost done
  ['Bathroom', 'Demolition', 'Remove old bathtub and tiling', 1, 'set', 220, 'done'],
  ['Bathroom', 'Plastering', 'Waterproof and plaster bathroom walls', 14, 'm²', 11, 'done'],
  ['Bathroom', 'Electrical', 'Install waterproof light fixture and exhaust fan wiring', 1, 'set', 140, 'done'],
  ['Bathroom', 'Painting',   'Apply moisture-resistant paint', 14, 'm²', 5, 'done'],
  ['Bathroom', 'Cleaning',   'Deep clean fixtures and grout lines', 1, 'set', 60, 'in_progress'],
  ['Bathroom', 'Tiling',     'Tile bathroom floor', 6, 'm²', 26, 'review'],

  // Kitchen — mixed
  ['Kitchen', 'Demolition', 'Remove old kitchen cabinetry', 1, 'set', 150, 'done'],
  ['Kitchen', 'Plastering', 'Plaster kitchen walls', 16, 'm²', 9, 'in_progress'],
  ['Kitchen', 'Painting',   'Prime and paint kitchen walls', 16, 'm²', 5, 'in_progress'],
  ['Kitchen', 'Electrical', 'Install electrical panel and kitchen circuit', 1, 'set', 420, 'review'],
  ['Kitchen', 'Tiling',     'Tile kitchen backsplash', 5, 'm²', 24, 'not_started'],

  // Living room — mixed
  ['Living room', 'Plastering', 'Skim coat living room walls', 22, 'm²', 8, 'done'],
  ['Living room', 'Electrical', 'Add outlets and ceiling light wiring', 1, 'set', 210, 'in_progress'],
  ['Living room', 'Painting',   'Two-coat paint, living room walls and ceiling', 22, 'm²', 6, 'review'],
  ['Living room', 'Cleaning',   'Post-paint cleanup and floor protection removal', 1, 'set', 45, 'in_progress'],

  // Balcony — not started
  ['Balcony', 'Demolition', 'Remove old balcony railing', 1, 'set', 90, 'not_started'],
  ['Balcony', 'Painting',   'Weatherproof paint for balcony walls', 6, 'm²', 7, 'not_started'],

  // No stage/zone — general project tasks
  [null, null, 'Order dumpster rental for debris removal', 1, 'set', 180, 'not_started'],
  [null, null, 'Submit renovation permit paperwork', 1, 'set', 0, 'done'],
  [null, null, 'Coordinate building inspector visit', 1, 'set', 0, 'review'],
  [null, null, 'Schedule final walkthrough with client', 1, 'set', 0, 'not_started'],
]

function buildTasks(projectId, workerIds) {
  return TASK_ROWS.map(([zone, stage, text, qty, unit, unitPrice, bucketKey], i) => {
    const bucket = BUCKET[bucketKey]
    // Flat admin-type tasks (no zone/stage) read oddly with a tiler/electrician
    // "assigned" to them — leave those unassigned regardless of bucket.
    const worker_id = (bucket.assigned && (zone || stage)) ? workerIds[i % workerIds.length] : null
    return {
      project_id: projectId,
      text, zone, stage,
      quantity: qty, unit, cost: qty * unitPrice, currency: 'USD',
      status: bucket.status,
      priority: 'normal',
      worker_id,
      start_date: bucket.status !== 'not_started' || bucket.assigned === false ? isoDate(daysAgo(3 + (i % 10))) : null,
      deadline: isoDate(daysFromNow(3 + (i % 12))),
      _bucketKey: bucketKey, // stripped before insert — used for the summary printout
    }
  })
}

const MATERIAL_ROWS = [
  ['Cement bags, 50kg', 40, 'pcs', 'purchased'],
  ['Ceramic floor tiles', 20, 'm²', 'purchased'],
  ['Electrical outlets', 15, 'pcs', 'needed'],
  ['Circuit breaker panel', 1, 'pcs', 'needed'],
  ['Wall primer', 10, 'l', 'purchased'],
  ['Interior paint, white', 25, 'l', 'purchased'],
  ['PVC piping', 12, 'm', 'purchased'],
  ['Tile grout', 8, 'kg', 'needed'],
  ['Drywall sheets', 18, 'pcs', 'purchased'],
  ['Silicone sealant', 6, 'pcs', 'purchased'],
]

const MATERIAL_REQUEST_ROWS = [
  ['More tile grout', 5, 'kg'],
  ['Extra electrical outlets', 6, 'pcs'],
]

const TOOL_ROWS = [
  ['Concrete mixer', 0],
  ['Tile cutter', 1],
  ['Laser level', 2],
  ['Cordless drill', 3],
]

const EXPENSE_ROWS = [
  ['Cement and tiling supplies', 640, 'materials', 18],
  ['Electrical panel and wiring', 480, 'materials', 12],
  ['Demolition crew, 2 days', 520, 'labor', 22],
  ['Dumpster rental', 210, 'equipment', 20],
  ['Tile cutter rental', 85, 'equipment', 9],
  ['Material delivery truck', 95, 'transport', 15],
  ['Paint and primer', 260, 'materials', 6],
  ['Miscellaneous site supplies', 70, 'other', 3],
]

const COMMENT_ROWS = [
  // [taskIndex in TASK_ROWS, authorKey ('owner' or worker key), text]
  [2,  'worker3', 'Panel is in, running the circuits to the outlets today.'],
  [2,  'owner',   'Great — let me know when it is ready for inspection.'],
  [5,  'worker2', 'Waterproofing done, plaster going on tomorrow.'],
  [9,  'worker1', 'Floor tile is set, grouting tomorrow morning.'],
  [12, 'worker2', 'First coat of primer on, will need a second pass.'],
  [16, 'worker3', 'Ceiling wiring is trickier than expected, might need another day.'],
  [22, 'owner',   'Permit submitted, waiting on the city for approval.'],
]

// ═════════════════════════════════════════════════════════════════════════
// DRY RUN — pure printout, no network calls at all
// ═════════════════════════════════════════════════════════════════════════

function printPlan() {
  const fakeWorkerIds = WORKERS.map(w => `<${w.key}-id>`)
  const tasks = buildTasks('<project-id>', fakeWorkerIds)
  const byBucket = tasks.reduce((acc, t) => { acc[t._bucketKey] = (acc[t._bucketKey] || 0) + 1; return acc }, {})
  const byZone = {}
  for (const t of tasks) { const z = t.zone || '(no zone)'; byZone[z] = (byZone[z] || 0) + 1 }

  console.log(`\n=== DRY RUN — nothing will be created or deleted ===\n`)
  console.log(`Project: "${PROJECT_NAME}"`)
  console.log(`Owner (DEMO_OWNER_ID): ${env.DEMO_OWNER_ID || '(not set — required for a real run)'}`)
  console.log(`Zones:  ${ZONES.join(', ')}`)
  console.log(`Stages: ${STAGES.join(', ')}`)
  console.log(`\nTeam: ${WORKERS.length} workers + 1 client (new @example.com auth users, tagged demo:true)`)
  for (const w of WORKERS) console.log(`  - ${w.name}  <${DEMO_EMAILS[w.key]}>  (${w.trade})`)
  console.log(`  - ${CLIENT.name}  <${DEMO_EMAILS[CLIENT.key]}>  (client)`)

  console.log(`\nTasks: ${tasks.length}`)
  console.log(`  by status bucket: ${Object.entries(byBucket).map(([k, v]) => `${k}=${v} (${Math.round(v / tasks.length * 100)}%)`).join(', ')}`)
  console.log(`  by zone: ${Object.entries(byZone).map(([k, v]) => `${k}=${v}`).join(', ')}`)
  for (const t of tasks) {
    const who = t.worker_id ? WORKERS[fakeWorkerIds.indexOf(t.worker_id) % WORKERS.length]?.name : '(unassigned)'
    console.log(`   [${t._bucketKey.padEnd(11)}] ${(t.zone || '-').padEnd(12)} ${(t.stage || '-').padEnd(11)} ${t.text}  — ${who}`)
  }

  console.log(`\nMaterials: ${MATERIAL_ROWS.length} (${MATERIAL_ROWS.filter(r => r[3] === 'needed').length} shortages)`)
  for (const [name, qty, unit, status] of MATERIAL_ROWS) console.log(`   [${status.padEnd(9)}] ${name} — ${qty} ${unit}`)
  console.log(`Material requests from workers: ${MATERIAL_REQUEST_ROWS.length}`)

  const workdays = lastWorkdays(5)
  console.log(`\nAttendance: ${workdays.length} workdays (${workdays.map(isoDate).join(', ')}) x ${WORKERS.length} workers`)
  console.log(`Work logs (hours): a subset of the above days/workers`)

  console.log(`\nExpenses: ${EXPENSE_ROWS.length}, total $${EXPENSE_ROWS.reduce((s, r) => s + r[1], 0)}`)
  console.log(`Tools: ${TOOL_ROWS.length}, each assigned to a different worker`)
  console.log(`Comments: ${COMMENT_ROWS.length}`)
  console.log(`\n(Run without --dry-run to actually create this. Requires SUPABASE_SERVICE_ROLE_KEY and DEMO_OWNER_ID in .env.local.)\n`)
}

if (DRY_RUN) {
  printPlan()
  process.exit(0)
}

// ═════════════════════════════════════════════════════════════════════════
// REAL RUN — everything past this point touches the network
// ═════════════════════════════════════════════════════════════════════════

const { createClient } = await import('@supabase/supabase-js')

const SUPABASE_URL = env.VITE_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const OWNER_ID = env.DEMO_OWNER_ID

if (!SUPABASE_URL || !SERVICE_KEY || !OWNER_ID) {
  console.error('Missing required env vars. Add to buildtrack/.env.local:')
  if (!SUPABASE_URL) console.error('  VITE_SUPABASE_URL (should already be in .env)')
  if (!SERVICE_KEY)  console.error('  SUPABASE_SERVICE_ROLE_KEY=...')
  if (!OWNER_ID)     console.error('  DEMO_OWNER_ID=...')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

async function removeDemo() {
  console.log('Removing existing demo data (if any)...')

  const { data: existingProjects } = await sb.from('projects').select('id').eq('name', PROJECT_NAME)
  const projectIds = (existingProjects || []).map(p => p.id)

  // Look up demo user ids by their fixed emails (idempotent across runs).
  const demoUserIds = []
  for (const email of Object.values(DEMO_EMAILS)) {
    const { data } = await sb.from('profiles').select('id').eq('email', email).maybeSingle()
    if (data?.id) demoUserIds.push(data.id)
  }

  for (const projectId of projectIds) {
    const { data: projTasks } = await sb.from('tasks').select('id').eq('project_id', projectId)
    const taskIds = (projTasks || []).map(t => t.id)
    if (taskIds.length) await sb.from('task_comments').delete().in('task_id', taskIds)
    await sb.from('material_requests').delete().eq('project_id', projectId)
    await sb.from('materials').delete().eq('project_id', projectId)
    await sb.from('expenses').delete().eq('project_id', projectId)
    await sb.from('tools').delete().eq('project_id', projectId)
    await sb.from('work_logs').delete().eq('project_id', projectId)
    await sb.from('tasks').delete().eq('project_id', projectId)
    await sb.from('project_workers').delete().eq('project_id', projectId)
  }
  if (projectIds.length) await sb.from('projects').delete().in('id', projectIds)

  if (demoUserIds.length) {
    await sb.from('attendance').delete().in('worker_id', demoUserIds)
    await sb.from('work_logs').delete().in('worker_id', demoUserIds)
    for (const id of demoUserIds) {
      const { error } = await sb.auth.admin.deleteUser(id)
      if (error) console.warn(`  could not delete demo user ${id}: ${error.message}`)
    }
  }

  console.log(`Removed: ${projectIds.length} project(s), ${demoUserIds.length} demo user(s).`)
}

if (REMOVE_ONLY) {
  await removeDemo()
  process.exit(0)
}

await removeDemo()
console.log('\nCreating demo project...')

// ── team ─────────────────────────────────────────────────────────────────
async function createDemoUser({ key, name, role }) {
  const password = 'Demo-' + Math.random().toString(36).slice(2, 10) + '!1'
  const { data, error } = await sb.auth.admin.createUser({
    email: DEMO_EMAILS[key],
    password,
    email_confirm: true,
    user_metadata: { name, role, ...DEMO_TAG },
  })
  if (error) throw new Error(`creating ${DEMO_EMAILS[key]}: ${error.message}`)
  const userId = data.user.id
  // The profiles row is created by a DB trigger off auth.users — give it a
  // moment, then fill in the demo-specific fields the trigger doesn't set.
  await new Promise(r => setTimeout(r, 400))
  await sb.from('profiles').update({
    name, role,
    worker_status: role === 'worker' ? 'on_site' : undefined,
  }).eq('id', userId)
  return userId
}

const workerIds = {}
for (const w of WORKERS) workerIds[w.key] = await createDemoUser(w)
const clientId = await createDemoUser(CLIENT)
console.log(`  created ${WORKERS.length} workers + 1 client`)

// ── project ──────────────────────────────────────────────────────────────
const { data: project, error: projErr } = await sb.from('projects').insert({
  name: PROJECT_NAME,
  foreman_id: OWNER_ID,
  address: '14 Maple Street, Apt 3B',
  deadline: isoDate(daysFromNow(21)),
  stages: STAGES,
  zones: ZONES,
  progress: 0,
}).select().single()
if (projErr) throw new Error(`creating project: ${projErr.message}`)
console.log(`  created project ${project.id}`)

const allWorkerIds = Object.values(workerIds)
await sb.from('project_workers').insert(allWorkerIds.map(worker_id => ({ project_id: project.id, worker_id })))
await sb.from('project_workers').insert({ project_id: project.id, worker_id: clientId })

// ── tasks ────────────────────────────────────────────────────────────────
const tasks = buildTasks(project.id, allWorkerIds).map(({ _bucketKey, ...t }) => t)
const { data: insertedTasks, error: taskErr } = await sb.from('tasks').insert(tasks).select('id, text')
if (taskErr) throw new Error(`creating tasks: ${taskErr.message}`)
console.log(`  created ${insertedTasks.length} tasks`)

const approvedCount = tasks.filter(t => t.status === 'approved').length
await sb.from('projects').update({ progress: Math.round(approvedCount / tasks.length * 100) }).eq('id', project.id)

// ── materials ────────────────────────────────────────────────────────────
await sb.from('materials').insert(MATERIAL_ROWS.map(([name, qty, unit, status]) => ({
  foreman_id: OWNER_ID, project_id: project.id, name, qty, unit, status,
  reported_by: 'Demo Foreman', reported_by_id: OWNER_ID,
  purchased_at: status === 'purchased' ? isoDate(daysAgo(4)) : null,
})))
await sb.from('material_requests').insert(MATERIAL_REQUEST_ROWS.map(([name, qty, unit], i) => ({
  project_id: project.id, worker_id: allWorkerIds[i % allWorkerIds.length],
  worker_name: WORKERS[i % WORKERS.length].name, name, qty, unit, status: 'open',
})))
console.log(`  created ${MATERIAL_ROWS.length} materials, ${MATERIAL_REQUEST_ROWS.length} requests`)

// ── tools ────────────────────────────────────────────────────────────────
await sb.from('tools').insert(TOOL_ROWS.map(([name, workerIdx]) => ({
  name, status: 'active', foreman_id: OWNER_ID, project_id: project.id,
  worker_id: allWorkerIds[workerIdx % allWorkerIds.length],
})))
console.log(`  created ${TOOL_ROWS.length} tools`)

// ── attendance + work logs ──────────────────────────────────────────────
const workdays = lastWorkdays(5)
const attendanceRows = []
const workLogRows = []
workdays.forEach((day, di) => {
  allWorkerIds.forEach((worker_id, wi) => {
    // Mostly present, occasional absence/sick day for variety.
    const roll = (di + wi) % 7
    const status = roll === 6 ? 'absent' : roll === 5 ? 'sick' : 'present'
    attendanceRows.push({ foreman_id: OWNER_ID, worker_id, date: isoDate(day), status, arrived_at: status === 'present' ? '08:00' : null })
    if (status === 'present' && (di + wi) % 2 === 0) {
      workLogRows.push({
        worker_id, project_id: project.id, log_date: isoDate(day), log_type: 'hours',
        value: 8, rate: WORKERS[wi]?.default_rate || 20, created_by: OWNER_ID,
      })
    }
  })
})
await sb.from('attendance').upsert(attendanceRows, { onConflict: 'worker_id,date' })
await sb.from('work_logs').insert(workLogRows)
console.log(`  created attendance for ${workdays.length} days, ${workLogRows.length} work log entries`)

// ── expenses ─────────────────────────────────────────────────────────────
await sb.from('expenses').insert(EXPENSE_ROWS.map(([title, amount, category, daysBack]) => ({
  project_id: project.id, foreman_id: OWNER_ID, title, amount, currency: 'USD', category,
  date: isoDate(daysAgo(daysBack)),
})))
console.log(`  created ${EXPENSE_ROWS.length} expenses`)

// ── comments ─────────────────────────────────────────────────────────────
for (const [taskIdx, authorKey, text] of COMMENT_ROWS) {
  const taskId = insertedTasks[taskIdx]?.id
  if (!taskId) continue
  const author_id = authorKey === 'owner' ? OWNER_ID : workerIds[authorKey]
  const author_name = authorKey === 'owner' ? 'Demo Foreman' : WORKERS.find(w => w.key === authorKey)?.name
  await sb.from('task_comments').insert({ task_id: taskId, author_id, author_name, text })
}
console.log(`  created ${COMMENT_ROWS.length} comments`)

console.log(`\nDone. Project id: ${project.id}\n`)
