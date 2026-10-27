// Tools, prompts and role rules of the assistant, shared by the assistant function and the
// offline model comparison. No I/O in here.

export const TOOLS: any[] = [
  {
    name: 'create_tasks',
    description: 'Create one or more tasks in a project, in the order the user said them.',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'integer', description: 'Project id from CONTEXT' },
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text:        { type: 'string', description: 'Short action title WITHOUT the stage name, e.g. "Remove old paint and plaster"' },
              description: { type: 'string', description: 'Details the user said for this task (how, what to check, materials, conditions), 1-3 clear sentences. Omit if there are none.' },
              stage:       { type: 'string', description: 'Group name for this task: reuse an existing stage of the project when it fits, otherwise a short new name (an area or sub-job, e.g. "Balcony (bottom)")' },
              zone:      { type: 'string', description: 'Room/location of this task, e.g. "Kitchen". Reuse an existing zone of the project when it fits; a new name is added to the project automatically.' },
              worker_id: { type: 'string', description: 'Worker id from CONTEXT, only if the user named who does it' },
              priority:  { type: 'string', enum: ['high', 'normal', 'low'] },
              deadline:  { type: 'string', description: 'YYYY-MM-DD, only if the user gave a date' },
              photo_indexes: { type: 'array', items: { type: 'integer' }, description: 'Numbers N of attached "Photo N" that belong to this NEW task' },
            },
            required: ['text'],
          },
        },
        warnings: {
          type: 'array',
          items: { type: 'string' },
          description: 'Short notes about a questionable order of work, e.g. painting right after plastering without puttying/priming. Same language as the user. Empty if the order looks fine.',
        },
      },
      required: ['project_id', 'tasks'],
    },
  },
  {
    name: 'add_zones',
    description: 'Add zones (rooms or locations such as "Living room", "Kitchen") to a project so tasks can be grouped by them.',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'integer', description: 'Project id from CONTEXT' },
        zones: { type: 'array', items: { type: 'string' }, description: 'Short zone names in the user language' },
      },
      required: ['project_id', 'zones'],
    },
  },
  {
    name: 'copy_tasks_to_zones',
    description: 'Copy existing tasks into other zones (rooms), for example the same plastering and painting tasks for the kitchen and the bedroom. Prefer this over create_tasks when the tasks already exist: it is exact and short.',
    input_schema: {
      type: 'object',
      properties: {
        task_ids: { type: 'array', items: { type: 'integer' }, description: 'Ids of the existing tasks to copy, from CONTEXT.tasks' },
        zones: { type: 'array', items: { type: 'string' }, description: 'Target zone names; a new name is added to the project automatically' },
      },
      required: ['task_ids', 'zones'],
    },
  },
  {
    name: 'update_task',
    description: 'Change existing tasks from CONTEXT.tasks. Include only the fields that change.',
    input_schema: {
      type: 'object',
      properties: {
        updates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              task_id:     { type: 'integer', description: 'Task id from CONTEXT.tasks' },
              text:        { type: 'string', description: 'New short title' },
              description: { type: 'string', description: 'New full description (replaces the old one)' },
              stage:       { type: 'string', description: 'Move to this stage (group)' },
              zone:        { type: 'string', description: 'Move to this zone (room/location)' },
              deadline:    { type: 'string', description: 'YYYY-MM-DD' },
              start_date:  { type: 'string', description: 'YYYY-MM-DD' },
              priority:    { type: 'string', enum: ['high', 'normal', 'low'] },
              worker_id:   { type: 'string', description: 'Worker id from CONTEXT.workers to assign' },
              status:      { type: 'string', enum: ['approved', 'new'], description: '"approved" = done, "new" = reopen' },
            },
            required: ['task_id'],
          },
        },
      },
      required: ['updates'],
    },
  },
  {
    name: 'delete_task',
    description: 'Delete tasks from CONTEXT.tasks. Only when the user clearly asked to delete/remove them.',
    input_schema: {
      type: 'object',
      properties: { task_ids: { type: 'array', items: { type: 'integer' } } },
      required: ['task_ids'],
    },
  },
  {
    name: 'attach_photos',
    description: 'Attach the photos the user sent to EXISTING tasks from CONTEXT.tasks. Only when the photo clearly belongs to that task (by what you see and what the user said).',
    input_schema: {
      type: 'object',
      properties: {
        attachments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              task_id: { type: 'integer', description: 'Task id from CONTEXT.tasks' },
              photo_indexes: { type: 'array', items: { type: 'integer' }, description: 'Numbers N of the attached "Photo N"' },
            },
            required: ['task_id', 'photo_indexes'],
          },
        },
      },
      required: ['attachments'],
    },
  },
  {
    name: 'mark_attendance',
    description: 'Record attendance for workers for a day (default today).',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD, default today' },
        records: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              worker_id:  { type: 'string', description: 'Worker id from CONTEXT' },
              status:     { type: 'string', enum: ['present', 'absent', 'sick', 'vacation'] },
              arrived_at: { type: 'string', description: 'HH:MM, only if the user said the arrival time' },
            },
            required: ['worker_id', 'status'],
          },
        },
      },
      required: ['records'],
    },
  },
  {
    name: 'add_material_request',
    description: 'Add materials that need to be bought/delivered for a project.',
    input_schema: {
      type: 'object',
      properties: {
        project_id: { type: 'integer', description: 'Project id from CONTEXT' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name:  { type: 'string' },
              qty:   { type: 'number' },
              unit:  { type: 'string', enum: ['pcs', 'm', 'm²', 'm³', 'kg', 'l', 'pack', 'roll'] },
              notes: { type: 'string' },
            },
            required: ['name'],
          },
        },
      },
      required: ['project_id', 'items'],
    },
  },
]


// ---- Everything else the app can do by hand (foreman only unless noted) ----
const str1 = (description: string) => ({ type: 'string', description })
const int1 = (description: string) => ({ type: 'integer', description })
const num1 = (description: string) => ({ type: 'number', description })
const ids = (description: string) => ({ type: 'array', items: { type: 'integer' }, description })
const toolDef = (name: string, description: string, properties: Record<string, unknown>, required: string[]) =>
  ({ name, description, input_schema: { type: 'object', properties, required } })
const DATE = 'YYYY-MM-DD'

export const MORE_TOOLS = [
  toolDef('add_expenses', 'Record money spent on a project (receipts, purchases, labour, transport...).', {
    project_id: int1('Project id from CONTEXT'),
    items: { type: 'array', items: { type: 'object', properties: {
      title: str1('What was bought/paid, short'), amount: num1('Exact amount the user said'),
      currency: str1('Currency code like EUR, only if the user named one; else omit'),
      category: { type: 'string', enum: ['materials', 'labor', 'equipment', 'transport', 'other'] },
      date: str1(DATE + ', default today'), notes: str1('Optional note'),
      photo_index: int1('Number N of the attached "Photo N" that is the receipt for this expense'),
    }, required: ['title', 'amount'] } },
  }, ['project_id', 'items']),
  toolDef('update_expense', 'Change an existing expense from CONTEXT.expenses. Include only what changes.', {
    expense_id: int1('Expense id'), title: str1('New title'), amount: num1('New amount'),
    category: { type: 'string', enum: ['materials', 'labor', 'equipment', 'transport', 'other'] },
    date: str1(DATE), notes: str1('New note'),
  }, ['expense_id']),
  toolDef('delete_expenses', 'Delete expenses from CONTEXT.expenses. Only when clearly asked.', { expense_ids: ids('Expense ids') }, ['expense_ids']),

  toolDef('add_work_logs', 'Record worked time of workers (hours or shifts) for a day.', {
    entries: { type: 'array', items: { type: 'object', properties: {
      worker_id: str1('Worker id from CONTEXT.workers'), date: str1(DATE + ', default today'),
      value: num1('Number of hours or shifts'), type: { type: 'string', enum: ['hours', 'shift'], description: 'hours or shift; default the worker rate type' },
      rate: num1('Pay rate only if the user said it and the worker has none'), notes: str1('Optional note'),
    }, required: ['worker_id', 'value'] } },
  }, ['entries']),
  toolDef('update_work_log', 'Change a recorded work entry from CONTEXT.work_logs.', {
    log_id: int1('Work log id'), value: num1('New hours/shifts'), type: { type: 'string', enum: ['hours', 'shift'] }, rate: num1('New rate'), notes: str1('New note'),
  }, ['log_id']),
  toolDef('delete_work_logs', 'Delete work entries from CONTEXT.work_logs. Only when clearly asked.', { log_ids: ids('Work log ids') }, ['log_ids']),

  toolDef('add_payments', 'Record money paid to workers (advance, salary).', {
    payments: { type: 'array', items: { type: 'object', properties: {
      worker_id: str1('Worker id'), amount: num1('Exact amount'), date: str1(DATE + ', default today'), notes: str1('Optional note, e.g. advance'),
    }, required: ['worker_id', 'amount'] } },
  }, ['payments']),
  toolDef('delete_payments', 'Delete payments from CONTEXT.payments. Only when clearly asked.', { payment_ids: ids('Payment ids') }, ['payment_ids']),

  toolDef('add_tool', 'Add a tool/equipment item, optionally assigned to a project or a worker.', {
    name: str1('Tool name'), location: str1('Where it is kept'), status: { type: 'string', enum: ['active', 'stored', 'lost'] },
    project_id: int1('Assign to this project'), worker_id: str1('Give to this worker'),
  }, ['name']),
  toolDef('update_tool', 'Change, assign, move or return a tool from CONTEXT.tools. Set unassign=true to take it back to stock.', {
    tool_id: int1('Tool id'), name: str1('New name'), location: str1('New location'), status: { type: 'string', enum: ['active', 'stored', 'lost'] },
    project_id: int1('Assign to this project'), worker_id: str1('Give to this worker'), unassign: { type: 'boolean', description: 'Clear project and worker' },
  }, ['tool_id']),
  toolDef('delete_tools', 'Delete tools from CONTEXT.tools. Only when clearly asked.', { tool_ids: ids('Tool ids') }, ['tool_ids']),

  toolDef('add_comment', 'Write a comment on a task from CONTEXT.tasks.', { task_id: int1('Task id'), text: str1('The comment text') }, ['task_id', 'text']),
  toolDef('update_materials', 'Mark materials from CONTEXT.materials as bought, needed again, or delete them.', {
    material_ids: ids('Material ids'), action: { type: 'string', enum: ['purchased', 'needed', 'delete'] },
  }, ['material_ids', 'action']),

  toolDef('create_project', 'Create a new project.', {
    name: str1('Project name'), address: str1('Address'), deadline: str1(DATE),
    stages: { type: 'array', items: { type: 'string' }, description: 'Optional stage names' },
    zones: { type: 'array', items: { type: 'string' }, description: 'Optional zone names (rooms)' },
  }, ['name']),
  toolDef('update_project', 'Change a project: name, address, deadline, or mark it completed/active.', {
    project_id: int1('Project id'), name: str1('New name'), address: str1('New address'), deadline: str1(DATE),
    status: { type: 'string', enum: ['active', 'completed'] },
  }, ['project_id']),
  toolDef('delete_project', 'Delete a whole project with all its tasks, expenses and documents. Only when the user clearly and explicitly asks to delete that project.', { project_id: int1('Project id') }, ['project_id']),

  toolDef('set_worker_rate', 'Set a worker pay rate (per hour or per shift).', {
    worker_id: str1('Worker id'), rate: num1('Exact rate'), rate_type: { type: 'string', enum: ['hours', 'shift'] },
  }, ['worker_id', 'rate', 'rate_type']),
  toolDef('update_worker', 'Change a worker status or contacts.', {
    worker_id: str1('Worker id'), status: { type: 'string', enum: ['on_site', 'day_off', 'sick', 'vacation', 'other'] },
    phone: str1('Phone'), telegram: str1('Telegram'),
  }, ['worker_id']),
  toolDef('add_worker_by_email', 'Add a registered worker to the crew by email, optionally to projects.', {
    email: str1('Exact email'), project_ids: ids('Projects to put the worker on'),
  }, ['email']),
  toolDef('assign_worker_to_projects', 'Put a crew worker on projects.', { worker_id: str1('Worker id'), project_ids: ids('Project ids') }, ['worker_id', 'project_ids']),
  toolDef('remove_worker_from_project', 'Take a worker off a project (tasks stay).', { worker_id: str1('Worker id'), project_id: int1('Project id') }, ['worker_id', 'project_id']),
  toolDef('respond_join_request', 'Accept or decline a pending join request from CONTEXT.join_requests.', { request_id: int1('Request id'), approve: { type: 'boolean' } }, ['request_id', 'approve']),
]
export const MORE_NAMES = MORE_TOOLS.map(t => t.name)

export const ROLE_TOOLS: Record<string, string[]> = {
  foreman: ['create_tasks', 'add_zones', 'copy_tasks_to_zones', 'update_task', 'delete_task', 'attach_photos', 'mark_attendance', 'add_material_request', ...MORE_NAMES],
  manager: ['add_material_request', 'add_comment'],
  worker:  ['attach_photos', 'add_material_request', 'add_comment'],
}

export function systemPrompt(context: unknown) {
  return `You are the assistant inside Tutuu, an app for construction and renovation crews.
Turn what the user says into app actions by calling tools. You only propose; the user confirms in the app, so never say something was already done.

Rules:
- Use only ids that appear in CONTEXT. Never invent ids. If there is exactly one project, use it.
- If something important is unclear (which project, which of two workers with the same name, how many), ask ONE short question and call no tool.
- Keep the user's order of works. Renovation order knowledge: rough work, plastering, putty, sanding, primer, painting; floors usually after dirty wet work and before final skirting. Put a short warning in "warnings" when the order looks wrong (for example painting right after plastering with no putty/primer, or floor finish before wet work), but still propose the tasks.
- Every task goes under a stage (a named group, usually an area or sub-job such as "Balcony (bottom)" or "Paving around the house"). Reuse an existing stage from CONTEXT when it fits; otherwise invent a short name from what the user said. The task title is the short action only and must not repeat the stage name.
- Put the details the user said into each task's description so nothing is lost (how to do it, what to check, materials). A rule for several tasks (for example "prime before every layer") becomes its own task when it is real work, otherwise goes into the descriptions of the tasks it applies to.
- Zones are the rooms or locations of a project (Kitchen, Living room, Balcony). When the user asks for zones, or lists rooms, use add_zones. A task has one zone: when the same work is needed in several rooms, create one task per room with that zone, or set the zone on existing tasks with update_task. Reuse existing zones from CONTEXT; new names are added to the project automatically. You CAN create zones, never say you cannot.
- When the user wants the same work in several rooms and those tasks already exist, use copy_tasks_to_zones (never retype them with create_tasks). The original tasks stay in their own zone. If the user asks to "distribute tasks across zones" and does not say which room each belongs to, assume the work applies to every room: keep the existing tasks where they are and copy them to the other zones, and say so in one short sentence.
- You can do everything the user can do by hand in the app. Money and people: use the exact numbers and names the user said, never round or guess an amount; if an amount, worker or project is unclear, ask one short question. Expenses -> add_expenses (change/delete with update_expense/delete_expenses); worked time -> add_work_logs; money paid to workers -> add_payments; tools -> add_tool/update_tool/delete_tools; comments -> add_comment; bought materials -> update_materials; projects -> create_project/update_project/delete_project; crew -> set_worker_rate, update_worker, add_worker_by_email, assign_worker_to_projects, remove_worker_from_project, respond_join_request. A worker's rate_type is in CONTEXT.workers; if the user gives hours for a worker whose rate is per shift (or the reverse), say so in the reply and ask which they mean. Photos of receipts go with add_expenses via photo_index.
- Deleting things (delete_*, delete_project) only when the user clearly asked for that exact thing.
- Never claim in your reply that something was added or changed unless you actually called a tool in this same answer. If you could not do it, say so.
- Reply in the user's language, 1-2 short sentences. The app shows the action preview itself, so do not repeat every field.
- Relative dates ("today", "tomorrow") are based on CONTEXT.today.
- The user may attach photos, labelled "Photo 1", "Photo 2"... Look at them. To put a photo on an existing task use attach_photos with a task from CONTEXT.tasks; to put it on a task you are creating now use that task's photo_indexes. Match by what the photo shows and what the user said. If it is unclear which task a photo belongs to, do not guess: say what you see and ask. In the reply, say in one short line per photo what you see and where you are putting it.
- To change existing tasks use update_task with ids from CONTEXT.tasks and only the fields that change (for example "make the wall orange instead of white" changes the title and the description, "move it by two days" changes the deadline: compute it from the task's current deadline; if it has none, ask for a date). Several tasks can change in one call. "This one is done" means status "approved". Use delete_task only when the user clearly asks to delete or remove tasks. The app asks the user to confirm, so do not ask for confirmation in your reply.
- A quote like [replying to: "Stage: task title"] points at that task or draft line; find it in CONTEXT.tasks or in the last draft.
- Earlier assistant turns may end with "[proposed: ...]": that is the draft the user was shown. If the user wants to change the latest draft (add, remove, reorder, change a date or a name), output the FULL updated draft as a new tool call, not only the change; it replaces the old one. Never write "[proposed" lines yourself.
- If the user asks a construction or renovation question instead, answer it helpfully and briefly (no tool call).
- If the request is about something else entirely, say briefly what you can help with: tasks, attendance, materials, photos and renovation questions.

CONTEXT:
${JSON.stringify(context)}`
}

export const ROUTER_PROMPT = `You route messages for a construction-crew app. Reply with exactly one word.
"question" = the user asks for advice or knowledge about construction/renovation (how, why, can I, how long, which material...), nothing to record.
"action" = the user wants something recorded or changed in the app (tasks, attendance, materials, photos, editing or deleting tasks, editing a proposed draft), or it is unclear.`

export const ADVISOR_PROMPT = `You are an experienced renovation and construction foreman answering a colleague's question inside a crew-management app.
- Answer in the user's language, practical and to the point. Keep it short: up to about 120 words, plain text, no headings. A short list only if it really helps.
- Say what is allowed and what the risks are (for example what happens if you paint right after plastering), not just "no".
- Be honest about uncertainty; drying times and norms depend on the product and conditions, so point to the manufacturer's data sheet when it matters.
- For load-bearing structures, electrical, gas and fire safety, give general information only and recommend a qualified specialist.
- If the user actually wants something recorded or changed in the app (create tasks, attendance, materials, photos, editing a draft), reply with exactly [[ACTION]] and nothing else.`

