import { useState, useEffect, useRef } from 'react'
import { Button, EmptyState } from '../../components/UI'
import { useT } from '../../i18n/useLanguage'
import { useStore, currencySymbol } from '../../store/useStore'
import { supabase } from '../../lib/supabase'
import TaskModal from '../../components/TaskModal'
import ConfirmModal from '../../components/ConfirmModal'
import { SortableStageList } from '../tasks/SortableStage'
import TaskCard from '../tasks/TaskCard'
import { FileText, UploadSimple, DownloadSimple, Printer, ChatCircle, Wrench, X } from '@phosphor-icons/react'
import * as XLSX from 'xlsx'
import { todayStr } from '../../lib/date'
import { buildReportHtml } from '../../lib/printReport'
import { normalizeUnit, unitLabel, displayUnit } from '../../i18n/units'

// Two independent grouping axes share this shape: `stage` = type of work
// (tasks.stage / projects.stages), `zone` = room or location (tasks.zone /
// projects.zones). Everything below is parameterized on `field` so both
// axes reuse the exact same logic instead of two near-duplicate copies.
const AXIS = {
  stage: { listKey: 'stages', taskKey: 'stage' },
  zone:  { listKey: 'zones',  taskKey: 'zone'  },
}

// ─── PROJECT TASKS TAB ───────────────────────────────────────────────────────
export default function ProjectTasksTab({ proj, canDelete = true, canEdit = true, tools = [], team = [] }) {
  const { t, lang } = useT()
  const { tasks, fetchTasks, addTask, deleteTask, approveTask, rejectTask, updateProject, updateTask,
          pendingOpenTaskId, setPendingOpenTask, profile } = useStore()
  const [filter,       setFilter]       = useState('all')
  const [showAdd,      setShowAdd]      = useState(false)
  const [editTask,     setEditTask]     = useState(null)
  const [deleteId,     setDeleteId]     = useState(null)
  const [openId,       setOpenId]       = useState(null)
  const [openStages,   setOpenStages]   = useState({})
  const [openZones,    setOpenZones]    = useState({})
  const [groupBy,      setGroupBy]      = useState(() => localStorage.getItem(`tutuu_groupby_${proj.id}`) || 'flat')
  const [newGroupName, setNewGroupName] = useState('')
  const [addingGroup,  setAddingGroup]  = useState(false)
  const [importPreview, setImportPreview] = useState(null) // [{text,stage,zone,unit,quantity,cost,currency}]
  const importRef = useRef()

  useEffect(() => { fetchTasks(proj.id) }, [proj.id])

  const setGroupByAndPersist = (next) => {
    setGroupBy(next)
    localStorage.setItem(`tutuu_groupby_${proj.id}`, next)
    // Adding a stage/zone only makes sense in that axis's own view
    setAddingGroup(false)
    setNewGroupName('')
  }

  const pTasks    = tasks.filter(t => t.project_id === proj.id)
  const projTools = tools.filter(tk => tk.project_id === proj.id)

  // Project's ordered lists for each axis
  const projStages = Array.isArray(proj.stages) && proj.stages.length > 0 ? proj.stages : []
  const projZones  = Array.isArray(proj.zones)  && proj.zones.length  > 0 ? proj.zones  : []
  const listFor = (field) => field === 'zone' ? projZones : projStages

  const filtered = pTasks.filter(t =>
    filter === 'active'  ? ['new','rejected'].includes(t.status) :
    filter === 'pending' ? t.status === 'pending' :
    filter === 'done'    ? t.status === 'approved' : true
  )

  const STATUS_ORDER   = { rejected: 0, new: 1, pending: 2, approved: 3 }
  const PRIORITY_ORDER = { high: 0, normal: 1, low: 2 }
  const sortTasks = (arr) => [...arr].sort((a, b) => {
    const sd = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)
    if (sd !== 0) return sd
    const pd = (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1)
    if (pd !== 0) return pd
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline)
    if (a.deadline) return -1
    if (b.deadline) return 1
    return 0
  })

  const STAGE_COLORS = Array(10).fill('var(--accent)')

  // Build the ordered group list for one axis: every group declared on the
  // project (even empty ones, so a foreman can open a freshly-created zone
  // and quick-add into it), plus any group names found only on tasks, with
  // ungrouped tasks ('—') last. Callers that only want populated groups
  // (export/print) filter + renumber afterwards — see note at call sites.
  const buildGroups = (taskList, field) => {
    const { taskKey } = AXIS[field]
    const list = listFor(field)
    const map = {}
    taskList.forEach(tk => {
      const key = tk[taskKey] || '—'
      if (!map[key]) map[key] = []
      map[key].push(tk)
    })
    const taskKeys = Object.keys(map)
    const ordered = list
    const extra   = taskKeys.filter(k => k !== '—' && !list.includes(k))
    const all     = [...ordered, ...extra, ...(taskKeys.includes('—') ? ['—'] : [])]
    return all.map(name => ({
      stage: name,
      stageIndex: list.indexOf(name), // -1 if not in the project's declared list
      items: sortTasks(map[name] || []),
    }))
  }

  const stageGroups = buildGroups(filtered, 'stage')
  const zoneGroups  = buildGroups(filtered, 'zone')
  const activeGroups = groupBy === 'zone' ? zoneGroups : stageGroups
  const activeList   = groupBy === 'zone' ? projZones  : projStages
  const activeOpen   = groupBy === 'zone' ? openZones  : openStages
  const setActiveOpen = groupBy === 'zone' ? setOpenZones : setOpenStages

  const addGroup = async (field, name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const { listKey } = AXIS[field]
    await updateProject(proj.id, { [listKey]: [...listFor(field), trimmed] })
  }

  const renameGroup = async (field, oldName, newName) => {
    const { listKey, taskKey } = AXIS[field]
    const list = listFor(field)
    if (oldName === '—') {
      // "—" means tasks without this group assigned — assign them to a new group
      const updatedList = list.includes(newName) ? list : [...list, newName]
      await updateProject(proj.id, { [listKey]: updatedList })
      const affected = pTasks.filter(tk => !tk[taskKey])
      await Promise.all(affected.map(tk => updateTask(tk.id, { [taskKey]: newName })))
    } else {
      const updatedList = list.map(s => s === oldName ? newName : s)
      await updateProject(proj.id, { [listKey]: updatedList })
      const affected = pTasks.filter(tk => tk[taskKey] === oldName)
      await Promise.all(affected.map(tk => updateTask(tk.id, { [taskKey]: newName })))
    }
  }

  const deleteGroup = async (field, name) => {
    const { listKey, taskKey } = AXIS[field]
    await updateProject(proj.id, { [listKey]: listFor(field).filter(s => s !== name) })
    const affected = pTasks.filter(tk => tk[taskKey] === name)
    await Promise.all(affected.map(tk => updateTask(tk.id, { [taskKey]: null })))
  }

  // ── Quick inline add ──────────────────────────────────────────────────────
  const quickAddToGroup = (field) => async ({ text, stage: groupValue, qty, unit, cost }) => {
    const { taskKey } = AXIS[field]
    const taskData = {
      text,
      [taskKey]: groupValue === '—' ? null : groupValue,
      project_id: proj.id,
      status:   'new',
      priority: 'normal',
      currency: currencySymbol(profile?.currency), // always save profile's currency
    }
    if (qty != null)  taskData.quantity = qty
    if (unit)         taskData.unit     = unit
    if (cost != null) taskData.cost     = cost
    await addTask(taskData)
    await fetchTasks(proj.id)
  }

  // ── CSV Import ────────────────────────────────────────────────────────────
  const downloadTemplate = () => {
    const bom = '﻿'
    // Use semicolons — Excel (Russian locale) opens these correctly
    const csv = bom + [
      'Этап;Зона;Название задачи;Описание;Ед.изм.;Кол-во;Сумма;Валюта',
      'Фундамент;;Заливка бетона;Марка М300;куб.м;50;5000;$',
      'Фундамент;;Армирование;;кг;800;;',
      'Стены;Кухня;Кладка кирпича;;кв.м;120;12000;€',
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'шаблон_задачи.csv'
    a.click()
  }

  const handleImportFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const raw = ev.target.result.replace(/^﻿/, '') // strip BOM

      // Auto-detect separator from first line
      const firstNewline = raw.indexOf('\n')
      const firstLine = raw.slice(0, firstNewline < 0 ? undefined : firstNewline)
      const sep = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ','

      // Full RFC-4180 CSV parser — handles multiline quoted fields
      const parseCSV = (text) => {
        const rows = []
        let row = [], cur = '', inQ = false, i = 0
        while (i < text.length) {
          const ch = text[i]
          if (ch === '"') {
            if (inQ && text[i + 1] === '"') { cur += '"'; i += 2; continue } // escaped ""
            inQ = !inQ; i++; continue
          }
          if (ch === sep && !inQ) {
            row.push(cur.trim()); cur = ''; i++; continue
          }
          if ((ch === '\r' || ch === '\n') && !inQ) {
            if (ch === '\r' && text[i + 1] === '\n') i++ // skip \r in \r\n
            row.push(cur.trim())
            if (row.some(c => c !== '')) rows.push(row)
            row = []; cur = ''; i++; continue
          }
          cur += ch; i++
        }
        // last row
        row.push(cur.trim())
        if (row.some(c => c !== '')) rows.push(row)
        return rows
      }

      const allRows = parseCSV(raw)
      if (allRows.length < 2) return

      // Map headers → column indexes by keyword
      const headers = allRows[0].map(h => h.toLowerCase().replace(/[^а-яёa-z0-9]/gi, ''))
      const find = (...keys) => headers.findIndex(h => keys.some(k => h.includes(k)))

      const iStage    = find('этап', 'stage', 'фаза', 'раздел', 'группа')
      const iZone     = find('зона', 'комната', 'помещение', 'zone', 'room', 'location')
      const iText     = find('назв', 'наим', 'задач', 'title', 'name', 'работ')
      const iDesc     = find('описан', 'desc', 'примеч', 'коммент')
      const iUnit     = find('ед', 'unit', 'един')
      const iQty      = find('кол', 'qty', 'количе', 'объём', 'объем')
      const iCost     = find('сумм', 'цен', 'стоим', 'cost', 'price')
      const iCurrency = find('валют', 'curr')

      if (iText === -1) {
        alert(t('tasks.csvColError'))
        return
      }

      const toNum = (s) => { if (!s) return null; const n = parseFloat(s.replace(',', '.')); return isNaN(n) ? null : n }

      const rows = allRows.slice(1).map(c => ({
        stage:       iStage    >= 0 ? (c[iStage]    || '') : '',
        zone:        iZone     >= 0 ? (c[iZone]     || '') : '',
        text:                          c[iText]     || '',
        description: iDesc     >= 0 ? (c[iDesc]     || '') : '',
        unit:        iUnit     >= 0 ? normalizeUnit(c[iUnit] || '') : '',
        quantity:    iQty      >= 0 ? toNum(c[iQty])       : null,
        cost:        iCost     >= 0 ? toNum(c[iCost])      : null,
        currency:    iCurrency >= 0 ? (c[iCurrency] || '$') : '$',
      })).filter(r => r.text.trim())

      setImportPreview(rows)
    }
    reader.readAsText(file, 'utf-8')
    e.target.value = ''
  }

  const confirmImport = async () => {
    if (!importPreview?.length) return
    // Add new stages/zones found in the CSV to the project's lists
    const newStages = [...projStages]
    const newZones  = [...projZones]
    importPreview.forEach(row => {
      if (row.stage && !newStages.includes(row.stage)) newStages.push(row.stage)
      if (row.zone  && !newZones.includes(row.zone))   newZones.push(row.zone)
    })
    const listUpdates = {}
    if (newStages.length !== projStages.length) listUpdates.stages = newStages
    if (newZones.length  !== projZones.length)  listUpdates.zones  = newZones
    if (Object.keys(listUpdates).length) await updateProject(proj.id, listUpdates)
    // Insert tasks
    await Promise.all(importPreview.map(row => addTask({
      text: row.text,
      description: row.description || null,
      stage: row.stage || null,
      zone: row.zone || null,
      unit: row.unit || null,
      quantity: row.quantity,
      cost: row.cost,
      currency: row.currency || '$',
      project_id: proj.id,
      status: 'new',
      priority: 'normal',
    })))
    await fetchTasks(proj.id)
    setImportPreview(null)
  }

  const exportXLSX = () => {
    const STATUS_LABEL = {
      new: t('procTasks.statusNew'), pending: t('procTasks.statusPending'),
      approved: t('procTasks.statusApproved'), rejected: t('procTasks.statusRejected'),
    }

    // Export-side groups only include populated buckets, renumbered after
    // the filter (buildGroups always returns every declared group —
    // including empty ones — for the live accordion view; that's not
    // wanted in an exported report).
    const populate = (field) => buildGroups(pTasks, field)
      .filter(g => g.items.length > 0)
      .map((g, i) => ({ ...g, num: i + 1 }))

    const stageExport = populate('stage')
    const hasZones = pTasks.some(tk => tk.zone)

    const wb = XLSX.utils.book_new()

    // ── Sheet 1: Tasks ────────────────────────────────────────────────────────
    const rows = [
      [t('procTasks.colNum'), t('procTasks.colStage'), t('procTasks.colName'), t('procTasks.colDesc'),
       t('procTasks.colUnit'), t('procTasks.colQty'), t('procTasks.colCost'), t('procTasks.colCurrency'), t('procTasks.colStatus')],
    ]
    let num = 1
    for (const { stage, items } of stageExport) {
      for (const tk of items) {
        rows.push([
          num++,
          stage,
          tk.text,
          tk.description || '',
          displayUnit(tk.unit, lang) || '',
          tk.quantity != null ? Number(tk.quantity) : '',
          tk.cost    != null ? Number(tk.cost)     : '',
          tk.currency || '',
          STATUS_LABEL[tk.status] || tk.status,
        ])
      }
    }

    const ws = XLSX.utils.aoa_to_sheet(rows)

    // Column widths
    ws['!cols'] = [
      { wch: 4 },   // №
      { wch: 18 },  // Этап
      { wch: 36 },  // Наименование
      { wch: 24 },  // Описание
      { wch: 8 },   // Ед.
      { wch: 8 },   // Кол-во
      { wch: 12 },  // Цена
      { wch: 6 },   // Валюта
      { wch: 14 },  // Статус
    ]

    XLSX.utils.book_append_sheet(wb, ws, t('procTasks.sheetTasks'))

    // ── Sheet 2: Summary by stage ─────────────────────────────────────────────
    const buildSummarySheet = (groups) => {
      const summaryRows = [
        [t('procTasks.colStage'), t('procTasks.colTotalTasks'), t('procTasks.colDone'), t('procTasks.colPending'), t('procTasks.colActive'), t('procTasks.colSum')],
      ]
      for (const { stage, items } of groups) {
        const done    = items.filter(t => t.status === 'approved').length
        const pending = items.filter(t => t.status === 'pending').length
        const active  = items.filter(t => ['new','rejected'].includes(t.status)).length
        const total   = items.reduce((s, t) => s + (t.cost != null ? Number(t.cost) : 0), 0)
        summaryRows.push([stage, items.length, done, pending, active, total || ''])
      }
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows)
      wsSummary['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 12 }]
      return wsSummary
    }

    XLSX.utils.book_append_sheet(wb, buildSummarySheet(stageExport), t('procTasks.sheetSummary'))

    // ── Sheet 3: Summary by zone (only if the project actually uses zones) ────
    if (hasZones) {
      XLSX.utils.book_append_sheet(wb, buildSummarySheet(populate('zone')), t('procTasks.sheetSummaryZone'))
    }

    const date = todayStr()
    XLSX.writeFile(wb, `${proj.name}_${t('procTasks.filenameSuffix')}_${date}.xlsx`)
  }

  const [printWithComments, setPrintWithComments] = useState(true)
  const [printing, setPrinting] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)

  const printTasks = async () => {
    // Must open window synchronously (before any await) — mobile Safari blocks popup if called after async
    const w = window.open('', '_blank')
    if (!w) { alert(t('procTasks.allowPopups')); return }
    w.document.write(`<html><body style="font-family:system-ui;padding:32px;color:#888">${t('procTasks.loadingMsg')}</body></html>`)

    setPrinting(true)

    // ── Fetch all comments for project tasks in one query ──
    let commentsMap = {}
    if (printWithComments && pTasks.length > 0) {
      const { data } = await supabase
        .from('task_comments')
        .select('task_id, author_name, text, created_at')
        .in('task_id', pTasks.map(tk => tk.id))
        .order('created_at', { ascending: true })
      ;(data || []).forEach(c => {
        if (!commentsMap[c.task_id]) commentsMap[c.task_id] = []
        commentsMap[c.task_id].push(c)
      })
    }

    // Print whatever grouping is currently on screen — the flat view has no
    // axis of its own, so printing falls back to grouping by stage.
    const printGroups = buildGroups(pTasks, groupBy === 'flat' ? 'stage' : groupBy)
      .filter(g => g.items.length > 0)
      .map((g, i) => ({ ...g, num: i + 1 }))

    let globalRow = 1
    const rows = printGroups.map(({ stage, num, items }) => {
      const taskRows = items.map(tk => {
        const n = globalRow++
        const comments = commentsMap[tk.id] || []
        const commentsHtml = comments.length > 0 ? `
          <div class="comments">
            ${comments.map(c => `
              <div class="comment">
                <span class="comment-meta">
                  💬 <strong>${c.author_name || '—'}</strong>
                  <span class="comment-date">${new Date(c.created_at).toLocaleDateString(lang, { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' })}</span>
                </span>
                <div class="comment-text">${c.text}</div>
              </div>`).join('')}
          </div>` : ''
        return `<tr>
          <td class="col-num">${n}</td>
          <td class="col-name">
            ${tk.text}
            ${tk.description ? `<div class="desc">${tk.description}</div>` : ''}
            ${commentsHtml}
          </td>
          <td class="col-unit">${displayUnit(tk.unit, lang) || ''}</td>
          <td class="col-qty">${tk.quantity != null ? tk.quantity : ''}</td>
          <td class="col-cost">${tk.cost != null ? `${Number(tk.cost).toLocaleString(lang)} ${tk.currency || ''}` : ''}</td>
        </tr>`
      }).join('')
      return `
        <tr class="stage-row">
          <td colspan="5"><span class="stage-num">${num}</span> ${stage}</td>
        </tr>
        ${taskRows}`
    }).join('')

    const totalComments = Object.values(commentsMap).reduce((s, a) => s + a.length, 0)

    const html = buildReportHtml({
      title: proj.name,
      saveLabel: t('procTasks.savePdfBtn'),
      closeLabel: t('procTasks.closeBtn'),
      style: `
        body { color: #000; }
        .top-bar { margin-bottom: 24px; }
        h1 { font-size: 16px; font-weight: bold; margin-bottom: 2px; }
        .meta { font-size: 11px; color: #555; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; border: 1.5px solid #000; }
        th, td { border: 1px solid #000; padding: 6px 8px; vertical-align: top; }
        thead th { background: #f0f0f0; font-weight: bold; font-size: 11px; text-align: center; }
        .col-num  { width: 42px; text-align: center; }
        .col-unit { width: 70px; text-align: center; }
        .col-qty  { width: 80px; text-align: center; }
        .col-cost { width: 110px; text-align: right; }
        .stage-row td { background: #e8e8e8; font-weight: bold; font-size: 12px; padding: 6px 10px; }
        .stage-num { display: inline-block; width: 20px; height: 20px; border-radius: 50%; background: #333; color: #fff; text-align: center; line-height: 20px; font-size: 10px; font-weight: bold; margin-right: 6px; }
        .desc { font-size: 10px; color: #555; margin-top: 3px; }
        .comments { margin-top: 6px; padding-top: 6px; border-top: 1px dashed #ccc; display: flex; flex-direction: column; gap: 5px; }
        .comment { background: #f9f9f9; border-left: 3px solid #c96b3a; padding: 4px 7px; border-radius: 0 4px 4px 0; }
        .comment-meta { font-size: 10px; color: #666; display: block; margin-bottom: 2px; }
        .comment-date { color: #999; margin-left: 6px; }
        .comment-text { font-size: 11px; color: #333; line-height: 1.4; white-space: pre-wrap; }
        .footer { margin-top: 16px; font-size: 10px; color: #aaa; text-align: right; }
      `,
      body: `
        <h1>${proj.name}</h1>
        <div class="meta">
          ${proj.address ? proj.address + ' · ' : ''}
          ${proj.deadline ? t('procTasks.deadlineLabel') + ' ' + proj.deadline + ' · ' : ''}
          ${t('procTasks.tasksLabel')} ${pTasks.length}
          ${totalComments > 0 ? ` · ${t('procTasks.commentsLabel')} ${totalComments}` : ''}
        </div>
        <table>
          <thead>
            <tr>
              <th class="col-num">№</th>
              <th>${t('procTasks.colName')}</th>
              <th class="col-unit">${t('procTasks.colUnit')}</th>
              <th class="col-qty">${t('procTasks.colQty')}</th>
              <th class="col-cost">${t('procTasks.colSum')}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="footer">Tutuu · ${new Date().toLocaleDateString(lang)}</div>
      `,
    })

    setPrinting(false)
    w.document.open()
    w.document.write(html)
    w.document.close()
  }

  // Sync open/closed accordion state per axis when its groups change, but
  // preserve the open/closed state of groups that already existed. Do NOT
  // use tasks.length as a dependency — that would collapse every group on
  // every task add/delete.
  const stageKeyStr = stageGroups.map(g => g.stage).join('\0')
  useEffect(() => {
    setOpenStages(prev => {
      const next = {}
      stageGroups.forEach(({ stage }) => { next[stage] = prev[stage] ?? false })
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, proj.id, stageKeyStr])

  const zoneKeyStr = zoneGroups.map(g => g.stage).join('\0')
  useEffect(() => {
    setOpenZones(prev => {
      const next = {}
      zoneGroups.forEach(({ stage }) => { next[stage] = prev[stage] ?? false })
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, proj.id, zoneKeyStr])

  // Auto-open a task coming from notification / search — opens it within
  // whichever axis is currently on screen.
  useEffect(() => {
    if (!pendingOpenTaskId) return
    const task = pTasks.find(tk => String(tk.id) === String(pendingOpenTaskId))
    if (!task) return
    const groupName = (groupBy === 'zone' ? task.zone : task.stage) || '—'
    setActiveOpen(prev => ({ ...prev, [groupName]: true }))
    setFilter('all')
    setOpenId(task.id)
    setPendingOpenTask(null)
    setTimeout(() => {
      document.getElementById(`task-card-${task.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 200)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOpenTaskId, pTasks.length])

  const toggleGroup = (name) => setActiveOpen(prev => ({ ...prev, [name]: !prev[name] }))

  return (
    <div style={{ paddingBottom:24 }}>

      {/* ── Add + Tools row ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8, gap:6 }}>
        <div style={{ display:'flex', gap:5, position:'relative' }}>
          <input ref={importRef} type="file" accept=".csv" style={{ display:'none' }} onChange={handleImportFile} />
          <button
            onClick={() => setShowExportMenu(v => !v)}
            style={{
              display:'flex', alignItems:'center', gap:5,
              background:'var(--accent-light,#FFF7ED)', border:'0.5px solid var(--border-medium,#E8E4DC)',
              borderRadius:7, padding:'5px 11px', cursor:'pointer',
              color:'var(--text-secondary)', fontSize:12, fontWeight:500,
            }}
          >
            <DownloadSimple size={15} weight="bold" />
            {t('tasks.exportBtn')}
            <span style={{ fontSize:9, marginLeft:1 }}>▾</span>
          </button>

          {showExportMenu && (
            <>
              <div style={{ position:'fixed', inset:0, zIndex:99 }} onClick={() => setShowExportMenu(false)} />
              <div style={{
                position:'absolute', top:'calc(100% + 4px)', left:0, zIndex:100,
                background:'var(--bg,#fff)', border:'0.5px solid var(--border-medium,#E8E4DC)',
                borderRadius:10, boxShadow:'0 4px 20px rgba(0,0,0,0.10)', minWidth:190, overflow:'hidden',
              }}>
                {[
                  canEdit && { icon: <FileText size={15} weight="bold" />,    label: t('tasks.menuTemplate'),  action: () => downloadTemplate() },
                  canEdit && { icon: <UploadSimple size={15} weight="bold" />, label: t('tasks.menuImport'),    action: () => importRef.current?.click() },
                  { icon: <DownloadSimple size={15} weight="bold" />,          label: t('tasks.menuXlsx'),      action: () => exportXLSX() },
                  { icon: <Printer size={15} weight="bold" />,                 label: printing ? '...' : t('tasks.menuPrint'), action: () => !printing && printTasks() },
                  {
                    icon: <ChatCircle size={15} weight="bold" />,
                    label: printWithComments ? t('tasks.menuCommentsOn') : t('tasks.menuCommentsOff'),
                    action: () => setPrintWithComments(v => !v),
                    accent: printWithComments,
                  },
                ].filter(Boolean).map((item, i) => (
                  <button key={i} onClick={() => { item.action(); setShowExportMenu(false) }} style={{
                    display:'flex', alignItems:'center', gap:10,
                    width:'100%', padding:'10px 14px', border:'none', background:'transparent',
                    cursor:'pointer', fontSize:13, textAlign:'left',
                    color: item.accent ? 'var(--accent,#EA580C)' : 'var(--text-primary,#2E2420)',
                    borderBottom: i < 4 ? '0.5px solid var(--border,#EAE3D8)' : 'none',
                  }}>
                    <span style={{ color: item.accent ? 'var(--accent,#EA580C)' : 'var(--text-secondary)' }}>{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        {canEdit && (
          <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>{t('tasks.add')}</Button>
        )}
      </div>

      {/* ── Group-by axis toggle + add-stage/zone (moved up here so it sits
           next to "+ Task" instead of buried below a long card list) ── */}
      <div style={{ display:'flex', gap:5, marginBottom:8, alignItems:'center', flexWrap:'wrap' }}>
        {['flat', 'stage', 'zone'].map(field => (
          <button
            key={field}
            className={`filter-btn ${groupBy === field ? 'active' : ''}`}
            onClick={() => setGroupByAndPersist(field)}
          >
            {field === 'flat' ? t('tasks.viewAll') : field === 'stage' ? t('tasks.groupByStage') : t('tasks.groupByZone')}
          </button>
        ))}
        {canEdit && groupBy !== 'flat' && !addingGroup && (
          // Literally the same <Button size="sm"> used for "+ Task" — same
          // classes, so the box (padding/font/radius) is guaranteed
          // identical; only color is overridden to keep it visually secondary.
          <Button
            size="sm"
            onClick={() => setAddingGroup(true)}
            style={{ marginLeft:'auto', color:'var(--accent,#EA580C)', borderColor:'var(--accent,#EA580C)' }}
          >
            + {groupBy === 'zone' ? t('tasks.addZone') : t('tasks.addStage')}
          </Button>
        )}
      </div>

      {canEdit && groupBy !== 'flat' && addingGroup && (
        <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8 }}>
          <input
            className="form-input"
            style={{ flex:1, fontSize:13 }}
            placeholder={groupBy === 'zone' ? t('projects.zonePlaceholder') : t('projects.stagePlaceholder')}
            value={newGroupName}
            onChange={e => setNewGroupName(e.target.value)}
            onKeyDown={e => { if (e.key==='Enter') { addGroup(groupBy, newGroupName); setNewGroupName(''); setAddingGroup(false) }; if (e.key==='Escape') setAddingGroup(false) }}
            autoFocus
          />
          <Button variant="primary" size="sm" onClick={() => { addGroup(groupBy, newGroupName); setNewGroupName(''); setAddingGroup(false) }}>{t('common.add')}</Button>
          <button onClick={() => { setAddingGroup(false); setNewGroupName('') }}
            style={{ background:'none', border:'none', fontSize:18, color:'var(--text-muted)', cursor:'pointer', lineHeight:1, display:'flex', alignItems:'center' }}><X size={18} weight="bold" /></button>
        </div>
      )}

      {/* ── Filter chips ── */}
      <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:10 }}>
        {['all','active','pending','done'].map(f => (
          <button key={f} className={`filter-btn ${filter===f?'active':''}`} onClick={() => setFilter(f)}>
            {f === 'all'     ? `${t('tasks.filterAll')} (${pTasks.length})` :
             f === 'active'  ? t('tasks.filterActive') :
             f === 'pending' ? `${t('tasks.filterReview')} (${pTasks.filter(t=>t.status==='pending').length})` : t('tasks.filterDone')}
          </button>
        ))}
      </div>

      {(groupBy === 'flat' ? filtered.length === 0 : (filtered.length === 0 && activeGroups.length === 0)) && (
        <EmptyState>{t('tasks.noTasks')}</EmptyState>
      )}

      {/* ── Flat view (default): every task, no grouping, no drag-and-drop —
           the only way in from a brand-new project with no stages/zones yet. ── */}
      {groupBy === 'flat' ? (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {sortTasks(filtered).map(tk => (
            <TaskCard key={tk.id} t={tk} openId={openId} setOpenId={setOpenId}
              onEdit={canEdit ? setEditTask : null}
              onDelete={canDelete ? setDeleteId : null}
              onApprove={canEdit && tk.status === 'pending' ? approveTask : null}
              onReject={canEdit && tk.status === 'pending' ? (id) => rejectTask(id, 'Needs revision') : null}
              onMarkDone={canEdit && tk.status !== 'approved' ? approveTask : null}
            />
          ))}
        </div>
      ) : (
        /* ── Group accordions with drag-and-drop — remounted on axis switch
             (key={groupBy}) so drag/quick-add/rename state never leaks
             between axes, even though both share the '—' bucket. ── */
        <SortableStageList
          key={groupBy}
          stageGroups={activeGroups}
          projStages={activeList}
          openStages={activeOpen}
          toggleStage={toggleGroup}
          openId={openId}
          setOpenId={setOpenId}
          canEdit={canEdit}
          canDelete={canDelete}
          setEditTask={setEditTask}
          setDeleteId={setDeleteId}
          approveTask={approveTask}
          rejectTask={rejectTask}
          STAGE_COLORS={STAGE_COLORS}
          onReorder={async (newOrder) => { await updateProject(proj.id, { [AXIS[groupBy].listKey]: newOrder }) }}
          onRename={canEdit ? (oldName, newName) => renameGroup(groupBy, oldName, newName) : undefined}
          onDeleteStage={canEdit ? (name) => deleteGroup(groupBy, name) : undefined}
          onQuickAdd={canEdit ? quickAddToGroup(groupBy) : undefined}
          namePlaceholder={groupBy === 'zone' ? t('tasks.zoneNamePlaceholder') : undefined}
          renameLabel={groupBy === 'zone' ? t('tasks.renameZone') : undefined}
          deleteLabel={groupBy === 'zone' ? t('tasks.zoneDelete') : undefined}
          emptyGroupLabel={groupBy === 'zone' ? t('tasks.noZoneTitle') : undefined}
          noItemsLabel={groupBy === 'zone' ? t('tasks.noTasksZone') : undefined}
        />
      )}

      {/* ── Tools on site ── */}
      {projTools.length > 0 && (
        <div style={{ marginTop:16 }}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:8, display:'flex', alignItems:'center', gap:5 }}>
            <Wrench size={11} weight="bold" /> {t('detail.toolsOnSite')}
          </div>
          <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
            {projTools.map(tk => (
              <div key={tk.id} style={{ background:'var(--bg-accent,#F2EDE4)', borderRadius:6, padding:'3px 9px', fontSize:10, color:'#7A6E66' }}>{tk.name}</div>
            ))}
          </div>
        </div>
      )}

      {(showAdd || editTask) && (
        <TaskModal task={editTask} defaultProjectId={proj.id} onClose={() => { setShowAdd(false); setEditTask(null); fetchTasks(proj.id) }} />
      )}
      {deleteId && (
        <ConfirmModal title={t('tasks.deleteTitle')} sub={tasks.find(t => t.id === deleteId)?.text}
          onConfirm={() => { deleteTask(deleteId); setDeleteId(null) }}
          onCancel={() => setDeleteId(null)} />
      )}

      {/* ── Import preview modal ── */}
      {importPreview && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setImportPreview(null)}>
          <div className="modal" style={{ maxWidth:700, maxHeight:'85dvh', display:'flex', flexDirection:'column' }}>
            <div className="modal-title">📥 {t('tasks.importTitle')}</div>
            <div style={{ overflowY:'auto', flex:1 }}>
              <div style={{ fontSize:12, color:'#888', marginBottom:10 }}>
                {t('tasks.importFound').replace('{n}', importPreview.length)}
              </div>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ background:'var(--bg-accent,#F2EDE4)' }}>
                    {[t('tasks.importColStage'),t('tasks.importColZone'),t('tasks.importColName'),t('tasks.importColDesc'),t('tasks.importColUnit'),t('tasks.importColQty'),t('tasks.importColAmount')].map(h => (
                      <th key={h} style={{ padding:'6px 8px', textAlign:'left', border:'1px solid var(--border,#EAE3D8)', fontWeight:700, fontSize:11, color:'#7A6E66' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {importPreview.map((r, i) => (
                    <tr key={i} style={{ background: i%2===0 ? 'var(--surface,#fff)' : 'var(--surface-2,#FDFBF8)' }}>
                      <td style={{ padding:'5px 8px', border:'1px solid var(--border,#EAE3D8)', color:'#888' }}>{r.stage || '—'}</td>
                      <td style={{ padding:'5px 8px', border:'1px solid var(--border,#EAE3D8)', color:'#888' }}>{r.zone || '—'}</td>
                      <td style={{ padding:'5px 8px', border:'1px solid var(--border,#EAE3D8)', fontWeight:600 }}>{r.text}</td>
                      <td style={{ padding:'5px 8px', border:'1px solid var(--border,#EAE3D8)', color:'#888' }}>{r.description || '—'}</td>
                      <td style={{ padding:'5px 8px', border:'1px solid var(--border,#EAE3D8)' }}>{unitLabel(r.unit, lang) || '—'}</td>
                      <td style={{ padding:'5px 8px', border:'1px solid var(--border,#EAE3D8)' }}>{r.quantity ?? '—'}</td>
                      <td style={{ padding:'5px 8px', border:'1px solid var(--border,#EAE3D8)' }}>{r.cost != null ? `${r.cost} ${r.currency}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-actions" style={{ paddingTop:12, borderTop:'1px solid #EAE3D8', marginTop:4 }}>
              <Button size="sm" onClick={() => setImportPreview(null)}>{t('tasks.importCancel')}</Button>
              <Button variant="primary" size="sm" onClick={confirmImport}>
                📥 {t('tasks.importConfirm').replace('{n}', importPreview.length)}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
