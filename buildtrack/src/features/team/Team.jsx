import { useState, useEffect } from 'react'
import { Badge, Button, StatCard, EmptyState, Alert } from '../../components/UI'
import { useT } from '../../i18n/useLanguage'
import { useStore, currencySymbol } from '../../store/useStore'
import { supabase } from '../../lib/supabase'
import AttendanceModal from '../../components/AttendanceModal'
import { generateMonthlyReport, generateAnnualReport } from './SalaryReportGenerator'
import { DownloadSimple, Phone, TelegramLogo, FileXls, CalendarBlank, ChartBar, CheckCircle, ClipboardText, Lightning, Wrench, Clock, Trash, CaretUp, CaretDown, File, X, Copy, Plus } from '@phosphor-icons/react'
import * as XLSX from 'xlsx'
import TimesheetModal from './TimesheetModal'
import { todayStr } from '../../lib/date'

// ─── inline month/year picker for a report button ───────────────────────────
// Opens right under whichever button triggered it, so picking a period never
// requires hunting for a control somewhere else on the page.
function ReportMonthPicker({ month, year, onMonth, onYear, onGenerate, onClose, lang, showMonth, t }) {
  return (
    <>
      <div style={{ position:'fixed', inset:0, zIndex:99 }} onClick={onClose} />
      <div style={{
        position:'absolute', top:'calc(100% + 4px)', left:0, zIndex:100,
        background:'var(--bg,#fff)', border:'0.5px solid var(--border-medium)',
        borderRadius:10, boxShadow:'0 4px 20px rgba(0,0,0,0.10)', padding:8,
        display:'flex', gap:6, alignItems:'center', whiteSpace:'nowrap',
      }}>
        {showMonth && (
          <select value={month} onChange={e => onMonth(Number(e.target.value))}
            style={{ fontSize:11, padding:'5px 6px', borderRadius:6, border:'0.5px solid var(--border-medium)', background:'var(--bg)', color:'var(--text-primary)' }}>
            {Array.from({length:12}, (_, i) => new Intl.DateTimeFormat(lang, {month:'short'}).format(new Date(2000, i, 1))).map((mn, i) => (
              <option key={i} value={i + 1}>{mn}</option>
            ))}
          </select>
        )}
        <select value={year} onChange={e => onYear(Number(e.target.value))}
          style={{ fontSize:11, padding:'5px 6px', borderRadius:6, border:'0.5px solid var(--border-medium)', background:'var(--bg)', color:'var(--text-primary)', width:58 }}>
          {[new Date().getFullYear() - 1, new Date().getFullYear()].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <button onClick={onGenerate} style={{ fontSize:11, fontWeight:600, padding:'5px 10px', borderRadius:6, background:'var(--accent)', color:'#fff', border:'none', cursor:'pointer' }}>
          {t('common.open')}
        </button>
      </div>
    </>
  )
}

// ─── WORKER STATUS CONFIG ────────────────────────────────────────────────────
const WORKER_STATUS = {
  on_site:   { label: 'On Site',       color: 'var(--success)',  bg: 'var(--success-bg)',  border: 'var(--success-border)',          dot: 'var(--success)'  },
  day_off:   { label: 'Day Off',       color: 'var(--text-muted)', bg: 'var(--bg-subtle)', border: 'var(--border-medium)',           dot: 'var(--text-muted)' },
  sick:      { label: 'Sick Leave',    color: 'var(--danger)',   bg: 'var(--danger-bg)',   border: 'var(--danger-border)',           dot: 'var(--danger)'   },
  vacation:  { label: 'Vacation',      color: 'var(--warning)',  bg: 'var(--warning-bg)',  border: 'rgba(245,158,11,0.25)',          dot: 'var(--warning)'  },
  other:     { label: 'Not Available', color: 'var(--text-muted)', bg: 'var(--bg-subtle)', border: 'var(--border-medium)',           dot: 'var(--text-muted)' },
}
const STATUS_CYCLE = ['on_site', 'day_off', 'sick', 'vacation', 'other']

// ─── TEAM ────────────────────────────────────────────────────────────────────
export default function Team() {
  const { t, lang } = useT()
  const { team, projects, tasks, tools, fetchProjects, fetchAllWorkers, updateWorkerStatus, updateWorkerContact, profile, joinRequests, fetchJoinRequests, approveJoinRequest, rejectJoinRequest, addManagerToTeam, addWorkerToTeam, addWorkerToProject, removeWorkerFromProject, workLogs, fetchWorkLogs, addWorkLog, deleteWorkLog, updateMemberRate, attendance, payments, fetchPayments, addPayment, deletePayment } = useStore()
  const [showInvite, setShowInvite] = useState(false)
  const [email, setEmail]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [msg, setMsg]               = useState('')
  const [codeCopied, setCodeCopied] = useState(false)
  const [openId, setOpenId]         = useState(null)
  const [managerEmail,   setManagerEmail]   = useState('')
  const [managerMsg,     setManagerMsg]     = useState('')
  const [managerLoading, setManagerLoading] = useState(false)
  const [joinReqError, setJoinReqError] = useState('')
  const [logForm, setLogForm]   = useState({}) // keyed by workerId
  const [showLogForm, setShowLogForm] = useState(null) // workerId or null
  const [rateEditId, setRateEditId]   = useState(null) // workerId editing rate
  const [rateInput, setRateInput]     = useState({ rate: '', type: 'shift' })
  const [showAttendance, setShowAttendance] = useState(false)
  const [showReportMenu, setShowReportMenu] = useState(false)
  const [expandedLogs, setExpandedLogs] = useState({}) // keyed by workerId
  const [expandedMonths, setExpandedMonths] = useState({}) // { [workerId]: { [monthKey]: bool } }
  const [showTimesheet, setShowTimesheet] = useState(false)
  const [payForm, setPayForm] = useState({})      // keyed by workerId
  const [showPayForm, setShowPayForm] = useState(null) // workerId
  const [contactEditId, setContactEditId] = useState(null) // workerId
  const [contactForm, setContactForm] = useState({}) // keyed by workerId
  const [projPickerId, setProjPickerId] = useState(null) // workerId with the "add to project" picker open
  const now = new Date()
  const [reportMonth, setReportMonth] = useState(now.getMonth() + 1)
  const [reportYear,  setReportYear]  = useState(now.getFullYear())
  // Per-worker "which month/year to report on" popover — keeps its own
  // month/year so picking one doesn't touch the unrelated page-header
  // selector, and vice versa (that's the bug this replaces).
  const [reportPicker, setReportPicker] = useState(null) // { workerId, mode: 'monthly'|'annual' } | null
  const [pickMonth, setPickMonth] = useState(now.getMonth() + 1)
  const [pickYear,  setPickYear]  = useState(now.getFullYear())
  const currSym = currencySymbol(profile?.currency)

  useEffect(() => {
    fetchProjects().then(() => {
      fetchAllWorkers()
    })
    if (profile?.role === 'foreman') fetchJoinRequests()
    useStore.getState().fetchAttendance(todayStr())
  }, [])

  // Known billing error codes translated; anything else (existing raw
  // English messages from this store action) is shown as-is.
  const billingErrorMsg = (error) =>
    error === 'limit_workers' ? t('errors.limitWorkers') :
    error === 'limit_projects' ? t('errors.limitProjects') :
    error === 'locked' ? t('errors.locked') : error

  const invite = async () => {
    if (!email.trim()) return
    setLoading(true); setMsg('')
    const { error, name } = await addWorkerToTeam(email.trim())
    if (error) { setMsg(billingErrorMsg(error)); setLoading(false); return }
    setMsg(`${name} added!`)
    fetchAllWorkers(); setEmail('')
    setLoading(false)
  }

  const copyInviteLink = () => {
    const link = `${window.location.origin}/app?join=${profile?.invite_code || ''}`
    navigator.clipboard.writeText(link).then(() => {
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
    })
  }

  const inviteManager = async () => {
    if (!managerEmail.trim()) return
    setManagerLoading(true); setManagerMsg('')
    const { error, name } = await addManagerToTeam(managerEmail.trim())
    setManagerLoading(false)
    if (error) { setManagerMsg(error); return }
    setManagerMsg(`${name} added as manager!`)
    setManagerEmail('')
  }

  const removeWorker = async (workerId, workerName) => {
    if (!window.confirm(`${t('team.removeFromTeam')} ${workerName}?`)) return
    const allProjects = useStore.getState().projects
    await supabase.from('project_workers')
      .delete()
      .eq('worker_id', workerId)
      .in('project_id', allProjects.map(p => p.id))
    setOpenId(null)
    fetchAllWorkers()
  }

  const exportPayroll = async () => {
    // Fetch all projects for this foreman, then work_logs filtered by selected month/year
    const { profile: p, projects: projs } = useStore.getState()
    if (!p) return

    // Date range for the selected month
    const monthStart = `${reportYear}-${String(reportMonth).padStart(2, '0')}-01`
    const lastDay = new Date(reportYear, reportMonth, 0).getDate()
    const monthEnd = `${reportYear}-${String(reportMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    const monthLabel = new Date(reportYear, reportMonth - 1, 1)
      .toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })

    let workerIds = []

    if (projs.length) {
      const { data: pwRows } = await supabase
        .from('project_workers')
        .select('worker_id')
        .in('project_id', projs.map(pr => pr.id))
      workerIds = [...new Set((pwRows || []).map(r => r.worker_id))]
    }

    // fallback: try join_requests
    if (!workerIds.length) {
      const { data: jrRows } = await supabase
        .from('join_requests')
        .select('worker_id')
        .eq('foreman_id', p.id)
        .eq('status', 'approved')
      workerIds = [...new Set((jrRows || []).map(r => r.worker_id))]
    }

    if (!workerIds.length) { alert(t('team.workersSection') + ' — ' + t('team.noEntries')); return }

    const { data: logs } = await supabase
      .from('work_logs')
      .select('*, worker:profiles!worker_id(name)')
      .in('worker_id', workerIds)
      .gte('log_date', monthStart)
      .lte('log_date', monthEnd)
      .order('worker_id').order('log_date', { ascending: true })

    const { data: pays } = await supabase
      .from('worker_payments')
      .select('*, worker:profiles!worker_id(name)')
      .in('worker_id', workerIds)
      .gte('paid_at', monthStart)
      .lte('paid_at', monthEnd)
      .order('paid_at', { ascending: true })

    if (!logs?.length && !pays?.length) { alert(`${t('team.noEntries')} — ${monthLabel}`); return }

    // Group by worker
    const byWorker = {}
    for (const id of workerIds) byWorker[id] = { name: '', logs: [], pays: [] }
    ;(logs || []).forEach(l => { if (byWorker[l.worker_id]) { byWorker[l.worker_id].name = l.worker?.name || l.worker_id; byWorker[l.worker_id].logs.push(l) } })
    ;(pays || []).forEach(p => { if (byWorker[p.worker_id]) { byWorker[p.worker_id].name = p.worker?.name || p.worker_id; byWorker[p.worker_id].pays.push(p) } })

    const wb = XLSX.utils.book_new()

    // ── Sheet 1: Summary ─────────────────────────────────────────────────────
    const summaryRows = [
      [`Расчётный лист за ${monthLabel}`],
      [],
      ['Рабочий', `Начислено (${currSym})`, `Выплачено (${currSym})`, `Остаток (${currSym})`],
    ]
    let totalEarned = 0, totalPaid = 0
    for (const w of Object.values(byWorker)) {
      const earned = w.logs.reduce((s, l) => s + l.value * l.rate, 0)
      const paid   = w.pays.reduce((s, p) => s + Number(p.amount), 0)
      totalEarned += earned; totalPaid += paid
      if (earned || paid) summaryRows.push([w.name || '—', earned, paid, earned - paid])
    }
    summaryRows.push(['ИТОГО', totalEarned, totalPaid, totalEarned - totalPaid])
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows)
    wsSummary['!cols'] = [{ wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 16 }]
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Сводка')

    // ── Sheet 2: Shifts / hours ───────────────────────────────────────────────
    if (logs?.length) {
      const logRows = [
        ['Рабочий', 'Дата', 'Тип', 'Кол-во', `Ставка (${currSym})`, `Сумма (${currSym})`, 'Заметка'],
      ]
      for (const w of Object.values(byWorker)) {
        w.logs.forEach(l => logRows.push([
          w.name,
          l.log_date,
          l.log_type === 'hours' ? 'Часы' : 'Смены',
          Number(l.value),
          Number(l.rate),
          l.value * l.rate,
          l.notes || '',
        ]))
      }
      const wsLogs = XLSX.utils.aoa_to_sheet(logRows)
      wsLogs['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 24 }]
      XLSX.utils.book_append_sheet(wb, wsLogs, 'Смены и часы')
    }

    // ── Sheet 3: Payments ─────────────────────────────────────────────────────
    if (pays?.length) {
      const payRows = [
        ['Рабочий', 'Дата', `Сумма (${currSym})`, 'Заметка'],
      ]
      for (const w of Object.values(byWorker)) {
        w.pays.forEach(p => payRows.push([w.name, p.paid_at, Number(p.amount), p.notes || '']))
      }
      const wsPays = XLSX.utils.aoa_to_sheet(payRows)
      wsPays['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 28 }]
      XLSX.utils.book_append_sheet(wb, wsPays, 'Выплаты')
    }

    XLSX.writeFile(wb, `зарплата_${reportYear}-${String(reportMonth).padStart(2, '0')}.xlsx`)
  }

  const cycleStatus = (workerId, currentStatus) => {
    const idx  = STATUS_CYCLE.indexOf(currentStatus || 'on_site')
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
    updateWorkerStatus(workerId, next)
  }

  // Stat counters
  const onSite = team.filter(m => !m.worker_status || m.worker_status === 'on_site').length
  const away   = team.length - onSite

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{t('team.title')}</h1>
        {profile?.role === 'foreman' && (() => {
          const today = todayStr()
          const todayDone = attendance.filter(a => a.date === today).length > 0
          return (
            <div style={{ display:'flex', gap:6 }}>
              <button onClick={() => setShowAttendance(true)} style={{
                display:'flex', alignItems:'center', gap:5,
                padding:'6px 12px', borderRadius:8,
                background: todayDone ? 'var(--success-bg)' : 'var(--accent-light)',
                color: todayDone ? 'var(--success)' : 'var(--accent)',
                border: `0.5px solid ${todayDone ? 'var(--success-border)' : 'var(--accent-border)'}`,
                cursor:'pointer', fontSize:12, fontWeight:500,
              }}>
                {todayDone ? <><CheckCircle size={12} weight="bold" /> {t('team.attendanceDone')}</> : <><ClipboardText size={12} weight="bold" /> {t('team.attendanceBtn')}</>}
              </button>
              <button onClick={() => setShowTimesheet(true)} style={{
                display:'flex', alignItems:'center', gap:5,
                padding:'6px 12px', borderRadius:8,
                background:'var(--bg)', color:'var(--text-secondary)',
                border:'0.5px solid var(--border-medium)',
                cursor:'pointer', fontSize:12, fontWeight:500,
              }}>
                <CalendarBlank size={12} weight="bold" /> {t('team.timesheetBtn')}
              </button>
            </div>
          )
        })()}
        {profile?.role === 'foreman' && (
          <div style={{ display:'flex', alignItems:'center', gap:4, position:'relative' }}>
            <select
              value={reportMonth}
              onChange={e => setReportMonth(Number(e.target.value))}
              style={{ fontSize:11, padding:'6px 6px', borderRadius:7, border:'0.5px solid var(--border-medium)', background:'var(--bg)', color:'var(--text-primary)', cursor:'pointer', outline:'none' }}
            >
              {Array.from({length:12}, (_, i) => new Intl.DateTimeFormat(lang, {month:'short'}).format(new Date(2000, i, 1))).map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
            <select
              value={reportYear}
              onChange={e => setReportYear(Number(e.target.value))}
              style={{ fontSize:11, padding:'6px 6px', borderRadius:7, border:'0.5px solid var(--border-medium)', background:'var(--bg)', color:'var(--text-primary)', cursor:'pointer', outline:'none', width:58 }}
            >
              {[now.getFullYear() - 1, now.getFullYear()].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button
              onClick={() => setShowReportMenu(v => !v)}
              style={{
                display:'flex', alignItems:'center', gap:5,
                padding:'6px 11px', borderRadius:7, border:'0.5px solid var(--border-medium)',
                background:'var(--bg)', color:'var(--text-secondary)',
                cursor:'pointer', fontSize:12, fontWeight:500,
              }}
            >
              <DownloadSimple size={15} weight="bold" />
              {t('team.reportBtn')}
              <span style={{ fontSize:9, marginLeft:1 }}>▾</span>
            </button>

            {showReportMenu && (
              <>
                <div style={{ position:'fixed', inset:0, zIndex:99 }} onClick={() => setShowReportMenu(false)} />
                <div style={{
                  position:'absolute', top:'calc(100% + 4px)', right:0, zIndex:100,
                  background:'var(--bg,#fff)', border:'0.5px solid var(--border-medium)',
                  borderRadius:10, boxShadow:'0 4px 20px rgba(0,0,0,0.10)', minWidth:210, overflow:'hidden',
                }}>
                  {[
                    { icon: <FileXls size={15} weight="bold" />,      label: t('team.downloadXlsx'),   action: exportPayroll },
                    { icon: <CalendarBlank size={15} weight="bold" />, label: t('team.monthlyReport'),  action: () => generateMonthlyReport(reportMonth, reportYear) },
                    { icon: <ChartBar size={15} weight="bold" />,      label: t('team.annualReport'),   action: () => generateAnnualReport(reportYear) },
                  ].map((item, i, arr) => (
                    <button key={i} onClick={() => { item.action(); setShowReportMenu(false) }} style={{
                      display:'flex', alignItems:'center', gap:10,
                      width:'100%', padding:'10px 14px', border:'none', background:'transparent',
                      cursor:'pointer', fontSize:13, textAlign:'left',
                      color:'var(--text-primary,#2E2420)',
                      borderBottom: i < arr.length - 1 ? '0.5px solid var(--border,#EAE3D8)' : 'none',
                    }}>
                      <span style={{ color:'var(--text-secondary)' }}>{item.icon}</span>
                      {item.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        <Button variant="primary" size="sm" onClick={() => { setShowInvite(!showInvite); setMsg('') }}>
          {showInvite ? t('team.close') : t('team.invite')}
        </Button>
      </div>

      {/* ── Stats ── */}
      <div className="stat-grid" style={{ gridTemplateColumns:'repeat(3,1fr)', marginBottom:12 }}>
        <StatCard label={t('team.statTotal')}   value={team.length} />
        <StatCard label={t('team.statOnSite')} value={onSite} />
        <StatCard label={t('team.statAway')}    value={away} danger={away > 0} />
      </div>

      {/* ── Add workers panel (foreman only) ── */}
      {profile?.role === 'foreman' && showInvite && (
        <div className="card card-body" style={{ marginBottom:12 }}>

          {/* Приглашение по коду */}
          <div style={{ paddingBottom:14, borderBottom:'1px solid var(--border-medium)' }}>
            <div style={{ fontSize:12, fontWeight:700, color:'var(--text-secondary)', marginBottom:6, textTransform:'uppercase', letterSpacing:'.06em' }}>
              {t('team.codeMethod')}
            </div>
            <div style={{ fontSize:12, color:'var(--text-secondary)', marginBottom:8 }}>{t('team.codeDesc')}</div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <div style={{
                flex:1, fontFamily:'monospace', fontSize:14, fontWeight:700, letterSpacing:'.04em',
                padding:'8px 12px', borderRadius:8, background:'var(--bg-subtle)',
                border:'0.5px solid var(--border-medium)', color:'var(--text-primary)',
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
              }}>
                {profile?.invite_code || '—'}
              </div>
              <Button variant="primary" size="sm" onClick={copyInviteLink}>
                {codeCopied ? t('team.copied') : <><Copy size={13} weight="bold" style={{ marginRight:4, verticalAlign:-2 }} />{t('team.copyCode')}</>}
              </Button>
            </div>
          </div>

          {/* Рабочий по email */}
          <div style={{ paddingBottom:14, paddingTop:14, borderBottom:'1px solid var(--border-medium)' }}>
            <div style={{ fontSize:12, fontWeight:700, color:'var(--text-secondary)', marginBottom:6, textTransform:'uppercase', letterSpacing:'.06em' }}>
              {t('team.emailMethod')}
            </div>
            <div style={{ fontSize:12, color:'var(--text-secondary)', marginBottom:8 }}>{t('team.emailDesc')}</div>
            <div style={{ display:'flex', gap:8 }}>
              <input className="form-input" placeholder={t('team.emailPlaceholder')}
                value={email} onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key==='Enter' && invite()} style={{ flex:1 }} />
              <Button variant="primary" size="sm" onClick={invite} disabled={loading}>{loading ? '...' : t('common.add')}</Button>
            </div>
            {msg && (
              <div style={{ marginTop:8, fontSize:12, padding:'6px 10px', borderRadius:6, background: msg.includes('added') || msg.includes('!') ? 'var(--success-bg)' : 'var(--danger-bg)', color: msg.includes('added') || msg.includes('!') ? 'var(--success)' : 'var(--danger)' }}>
                {msg}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Pending join requests ── */}
      {profile?.role === 'foreman' && joinRequests.length > 0 && (
        <div className="card" style={{ marginBottom:12, padding:0 }}>
          <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border-medium)', display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--accent)', letterSpacing:'.08em', textTransform:'uppercase' }}>{t('team.joinRequests')}</div>
            <div style={{ background:'var(--accent-light,var(--accent-light))', color:'var(--accent)', fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:10 }}>{joinRequests.length}</div>
          </div>
          {joinReqError && <div style={{ padding:'8px 14px' }}><Alert>{joinReqError}</Alert></div>}
          {joinRequests.map(r => (
            <div key={r.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderBottom:'1px solid var(--border-medium)' }}>
              <div style={{ width:36, height:36, borderRadius:'50%', background:'var(--accent-light,var(--accent-light))', color:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700, flexShrink:0 }}>
                {r.worker?.name?.charAt(0)?.toUpperCase()}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600, color:'var(--text-1,#2E2420)' }}>{r.worker?.name}</div>
                <div style={{ fontSize:11, color:'var(--text-muted)' }}>{t('team.wantsToJoin')}</div>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                <Button size="sm" variant="primary" onClick={async () => {
                  setJoinReqError('')
                  const { error } = await approveJoinRequest(r.id, r.worker.id)
                  if (error) setJoinReqError(billingErrorMsg(error))
                }}>{t('team.accept')}</Button>
                <Button size="sm" variant="danger"  onClick={() => rejectJoinRequest(r.id)}>{t('team.decline')}</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Worker cards ── */}
      {team.length === 0 && <EmptyState>{t('team.noMembers')}</EmptyState>}

      {/* Workers section */}
      {team.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize:10, fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:8, paddingLeft:2 }}>
            {t('team.workersSection')} ({team.length})
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {team.map(m => {
          const st       = m.worker_status || 'on_site'
          const stCfg    = WORKER_STATUS[st] || WORKER_STATUS.on_site
          const isOpen   = openId === m.id
          // Worker's projects
          const workerProjects = (m.project_ids || []).map(pid => projects.find(p => p.id === pid)).filter(Boolean)
          // Worker's tools
          const workerTools = tools.filter(t => t.worker_id === m.id)
          // Worker's active tasks
          const workerTasks = tasks.filter(t => t.worker_id === m.id && t.status !== 'approved')
          const workerDone  = tasks.filter(t => t.worker_id === m.id && t.status === 'approved').length

          return (
            <div key={m.id} style={{
              background: 'var(--surface,#fff)',
              border: `1.5px solid ${isOpen ? 'var(--accent)' : 'var(--border-medium)'}`,
              borderRadius: 14, overflow: 'hidden',
              boxShadow: isOpen ? '0 3px 10px rgba(201,107,58,0.10)' : 'none',
              transition: 'border-color .15s, box-shadow .15s',
            }}>
              {/* ── Collapsed row ── */}
              <div
                onClick={() => {
                  const newId = openId === m.id ? null : m.id
                  setOpenId(newId)
                  if (newId && !workLogs[newId]) fetchWorkLogs(newId)
                  if (newId && !payments[newId]) fetchPayments(newId)
                }}
                style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', cursor:'pointer', background: isOpen ? 'var(--accent-light,var(--accent-light))' : 'var(--surface,#fff)' }}
              >
                {/* Avatar with status dot */}
                <div style={{ position:'relative', flexShrink:0 }}>
                  <div style={{
                    width:40, height:40, borderRadius:'50%',
                    background: isOpen ? 'var(--accent)' : 'var(--bg-accent)',
                    color: isOpen ? '#fff' : 'var(--accent)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:15, fontWeight:700,
                  }}>
                    {m.name?.charAt(0)?.toUpperCase()}
                  </div>
                  <div style={{
                    position:'absolute', bottom:0, right:0,
                    width:11, height:11, borderRadius:'50%',
                    background: stCfg.dot, border:'2px solid var(--bg-card)',
                  }} />
                  {(() => {
                    const today = todayStr()
                    const rec = attendance.find(a => a.worker_id === m.id && a.date === today)
                    if (!rec) return null
                    const dotColor = rec.status === 'present' ? 'var(--success)' : rec.status === 'absent' ? 'var(--danger)' : rec.status === 'sick' ? 'var(--violet)' : 'var(--info)'
                    return (
                      <div style={{
                        position:'absolute', bottom:0, left:0,
                        width:10, height:10, borderRadius:'50%',
                        background: dotColor, border:'2px solid var(--bg)',
                      }} />
                    )
                  })()}
                </div>

                {/* Name + quick info */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600, color: isOpen ? 'var(--accent)' : 'var(--text-1,#2E2420)', marginBottom:3 }}>{m.name}</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:5, alignItems:'center' }}>
                    <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:10, background: stCfg.bg, color: stCfg.color, border:`1px solid ${stCfg.border}` }}>
                      {t('team.ws_' + st)}
                    </span>
                    {workerTasks.length > 0 && (
                      <span style={{ fontSize:10, color:'var(--accent)', fontWeight:600, display:'flex', alignItems:'center', gap:2 }}><Lightning size={10} weight="bold" /> {workerTasks.length} tasks</span>
                    )}
                    {workerTools.length > 0 && (
                      <span style={{ fontSize:10, color:'var(--text-secondary)', display:'flex', alignItems:'center', gap:2 }}><Wrench size={10} weight="bold" /> {workerTools.length}</span>
                    )}
                    {m.phone && (
                      <a
                        href={`tel:${m.phone}`}
                        onClick={e => e.stopPropagation()}
                        style={{ fontSize:10, color:'var(--accent)', textDecoration:'none', display:'flex', alignItems:'center', gap:2 }}
                      >
                        <Phone size={11} weight="bold" /> {m.phone}
                      </a>
                    )}
                  </div>
                </div>

                {/* Status cycle button (foreman only) */}
                {profile?.role === 'foreman' && (
                  <button
                    onClick={e => { e.stopPropagation(); cycleStatus(m.id, st) }}
                    title="Tap to change status"
                    style={{
                      flexShrink:0, padding:'5px 10px', borderRadius:8, fontSize:11, fontWeight:600,
                      background: stCfg.bg, color: stCfg.color,
                      border: `1px solid ${stCfg.border}`,
                      cursor:'pointer', transition:'opacity .15s',
                    }}
                  >
                    ⟳
                  </button>
                )}

                <span style={{ fontSize:10, color:'var(--text-muted)', display:'flex', alignItems:'center' }}>{isOpen ? <CaretUp size={10} weight="bold" /> : <CaretDown size={10} weight="bold" />}</span>
              </div>

              {/* ── Expanded detail ── */}
              {isOpen && (
                <div style={{ borderTop:'1px solid var(--border-medium)', padding:'12px 14px', background:'var(--bg-subtle)' }}>

                  {/* Status picker row */}
                  {profile?.role === 'foreman' && (
                    <div style={{ marginBottom:12 }}>
                      <div style={{ fontSize:10, fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:6 }}>{t('team.statusHeader')}</div>
                      <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                        {STATUS_CYCLE.map(s => {
                          const cfg = WORKER_STATUS[s]
                          const isActive = st === s
                          return (
                            <button key={s}
                              onClick={() => updateWorkerStatus(m.id, s)}
                              style={{
                                padding:'5px 11px', borderRadius:20, fontSize:11, fontWeight:600, cursor:'pointer',
                                background: isActive ? cfg.bg : 'var(--bg-subtle)',
                                color: isActive ? cfg.color : 'var(--text-muted)',
                                border: isActive ? `1.5px solid ${cfg.border}` : '1.5px solid var(--border-medium)',
                                transition:'all .12s',
                              }}
                            >
                              {t('team.ws_' + s)}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Contacts */}
                  <div style={{ marginBottom:12 }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                      <div style={{ fontSize:10, fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color:'var(--text-muted)' }}>{t('team.contacts')}</div>
                      {(profile?.role === 'foreman' || profile?.id === m.id) && (
                        <button
                          onClick={() => {
                            setContactEditId(contactEditId === m.id ? null : m.id)
                            setContactForm(f => ({ ...f, [m.id]: { phone: m.phone || '', telegram: m.telegram || '' } }))
                          }}
                          style={{ fontSize:11, fontWeight:500, color:'var(--accent)', background:'var(--accent-light)', border:'none', borderRadius:6, padding:'3px 10px', cursor:'pointer' }}
                        >
                          {contactEditId === m.id ? t('common.cancel') : t('common.edit')}
                        </button>
                      )}
                    </div>

                    {contactEditId === m.id ? (
                      <div style={{ background:'var(--bg-subtle,#FAFAF9)', border:'0.5px solid var(--border)', borderRadius:8, padding:'10px 12px' }}>
                        <div style={{ marginBottom:8 }}>
                          <div style={{ fontSize:10, color:'var(--text-muted)', marginBottom:3 }}>{t('account.phoneLabel')}</div>
                          <input
                            type="tel"
                            placeholder="+7 999 123 45 67"
                            value={contactForm[m.id]?.phone || ''}
                            onChange={e => setContactForm(f => ({ ...f, [m.id]: { ...f[m.id], phone: e.target.value } }))}
                            style={{ width:'100%', fontSize:12, padding:'6px 8px', borderRadius:6, border:'0.5px solid var(--border-medium)', background:'var(--bg)', color:'var(--text-primary)' }}
                          />
                        </div>
                        <div style={{ marginBottom:10 }}>
                          <div style={{ fontSize:10, color:'var(--text-muted)', marginBottom:3 }}>Telegram</div>
                          <input
                            type="text"
                            placeholder="@username"
                            value={contactForm[m.id]?.telegram || ''}
                            onChange={e => setContactForm(f => ({ ...f, [m.id]: { ...f[m.id], telegram: e.target.value } }))}
                            style={{ width:'100%', fontSize:12, padding:'6px 8px', borderRadius:6, border:'0.5px solid var(--border-medium)', background:'var(--bg)', color:'var(--text-primary)' }}
                          />
                        </div>
                        <div style={{ display:'flex', justifyContent:'flex-end' }}>
                          <button
                            onClick={async () => {
                              const cf = contactForm[m.id] || {}
                              await updateWorkerContact(m.id, cf.phone?.trim(), cf.telegram?.trim())
                              setContactEditId(null)
                            }}
                            style={{ fontSize:11, padding:'5px 14px', borderRadius:6, background:'var(--accent)', color:'#fff', border:'none', cursor:'pointer', fontWeight:500 }}
                          >{t('common.save')}</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                        {m.phone ? (
                          <a href={`tel:${m.phone}`} style={{ fontSize:12, color:'var(--accent)', textDecoration:'none', display:'flex', alignItems:'center', gap:4 }}>
                            <Phone size={11} weight="bold" /> {m.phone}
                          </a>
                        ) : null}
                        {m.telegram ? (
                          <a
                            href={`https://t.me/${m.telegram.replace(/^@/, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize:12, color:'#229ED9', textDecoration:'none', display:'flex', alignItems:'center', gap:4 }}
                          >
                            <TelegramLogo size={12} weight="bold" /> {m.telegram.startsWith('@') ? m.telegram : `@${m.telegram}`}
                          </a>
                        ) : null}
                        {!m.phone && !m.telegram && (
                          <span style={{ fontSize:11, color:'var(--text-muted)' }}>{t('team.notSpecified')}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Projects */}
                  <div style={{ marginBottom:10 }}>
                    <div style={{ fontSize:10, fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:5 }}>{t('team.projectsHeader')}</div>
                    <div style={{ display:'flex', gap:5, flexWrap:'wrap', alignItems:'center' }}>
                      {workerProjects.map(p => (
                        <span key={p.id} style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, fontWeight:600, background:'var(--accent-light,var(--accent-light))', color:'var(--accent)', borderRadius:8, padding:'3px 6px 3px 10px' }}>
                          {p.name}
                          <button
                            onClick={async (e) => { e.stopPropagation(); await removeWorkerFromProject(p.id, m.id); fetchAllWorkers() }}
                            title={t('team.removeFromProject')}
                            style={{ background:'none', border:'none', cursor:'pointer', color:'var(--accent)', opacity:0.6, padding:0, display:'flex', alignItems:'center' }}
                          ><X size={10} weight="bold" /></button>
                        </span>
                      ))}
                      {workerProjects.length === 0 && (
                        <span style={{ fontSize:11, color:'var(--text-muted)' }}>{t('common.none')}</span>
                      )}
                      <div style={{ position:'relative' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); setProjPickerId(projPickerId === m.id ? null : m.id) }}
                          style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, fontWeight:700, background:'var(--accent)', border:'none', color:'#fff', borderRadius:8, padding:'4px 10px', cursor:'pointer', boxShadow:'0 1px 3px rgba(0,0,0,0.12)' }}
                        >
                          <Plus size={11} weight="bold" />{t('team.addToProjectBtn')}
                        </button>
                        {projPickerId === m.id && (
                          <div
                            onClick={e => e.stopPropagation()}
                            style={{ position:'absolute', top:'calc(100% + 4px)', left:0, zIndex:20, background:'var(--surface,#fff)', border:'1px solid var(--border-medium)', borderRadius:10, boxShadow:'0 6px 20px rgba(0,0,0,0.12)', minWidth:170, maxHeight:220, overflowY:'auto', padding:6 }}
                          >
                            {projects.filter(p => !workerProjects.some(wp => wp.id === p.id)).length === 0 ? (
                              <div style={{ fontSize:11, color:'var(--text-muted)', padding:'6px 8px' }}>{t('team.allProjectsAssigned')}</div>
                            ) : projects.filter(p => !workerProjects.some(wp => wp.id === p.id)).map(p => (
                              <div
                                key={p.id}
                                onClick={async () => { await addWorkerToProject(m.id, p.id); fetchAllWorkers(); setProjPickerId(null) }}
                                style={{ fontSize:12, padding:'6px 8px', borderRadius:6, cursor:'pointer', color:'var(--text-primary)' }}
                                onMouseEnter={e => e.currentTarget.style.background='var(--bg-subtle)'}
                                onMouseLeave={e => e.currentTarget.style.background='transparent'}
                              >{p.name}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Tools */}
                  <div style={{ marginBottom:10 }}>
                    <div style={{ fontSize:10, fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:5 }}>{t('team.toolsHeader')}</div>
                    {workerTools.length === 0
                      ? <span style={{ fontSize:11, color:'var(--text-muted)' }}>{t('team.noTools')}</span>
                      : <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                          {workerTools.map(t => (
                            <span key={t.id} style={{ fontSize:11, fontWeight:500, background:'var(--bg-accent,#F2EDE4)', color:'var(--text-secondary)', borderRadius:8, padding:'3px 10px', border:'1px solid var(--border-medium)' }}>{t.name}</span>
                          ))}
                        </div>
                    }
                  </div>

                  {/* Task summary */}
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color:'var(--text-muted)', marginBottom:5 }}>{t('team.tasksHeader')}</div>
                    <div style={{ display:'flex', gap:10 }}>
                      {workerTasks.filter(t=>['new','rejected'].includes(t.status)).length > 0 && (
                        <span style={{ fontSize:11, fontWeight:600, color:'var(--accent)', display:'flex', alignItems:'center', gap:2 }}><Lightning size={11} weight="bold" /> {workerTasks.filter(t=>['new','rejected'].includes(t.status)).length} active</span>
                      )}
                      {workerTasks.filter(t=>t.status==='pending').length > 0 && (
                        <span style={{ fontSize:11, fontWeight:600, color:'var(--warning)', display:'flex', alignItems:'center', gap:2 }}><Clock size={11} weight="bold" /> {workerTasks.filter(t=>t.status==='pending').length} in review</span>
                      )}
                      {workerDone > 0 && (
                        <span style={{ fontSize:11, fontWeight:600, color:'var(--success)', display:'flex', alignItems:'center', gap:2 }}><CheckCircle size={11} weight="bold" /> {workerDone} done</span>
                      )}
                      {workerTasks.length === 0 && workerDone === 0 && (
                        <span style={{ fontSize:11, color:'var(--text-muted)' }}>{t('team.noTasks')}</span>
                      )}
                    </div>
                  </div>

                  {/* ── Payments section ── */}
                  {profile?.role === 'foreman' && (() => {
                    const logs     = workLogs[m.id] || []
                    const earned   = logs.reduce((s, l) => s + l.value * l.rate, 0)
                    const pays     = payments[m.id] || []
                    const paid     = pays.reduce((s, p) => s + p.amount, 0)
                    const balance  = earned - paid
                    const pf = payForm[m.id] || { date: todayStr(), amount: '', notes: '' }
                    const setPf = patch => setPayForm(f => ({ ...f, [m.id]: { ...pf, ...patch } }))
                    return (
                      <div style={{ marginTop:12, borderTop:'0.5px solid var(--border)', paddingTop:12 }}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                          <div style={{ fontSize:10, fontWeight:500, letterSpacing:'.06em', textTransform:'uppercase', color:'var(--text-muted)' }}>{t('team.paySection')}</div>
                          <button
                            onClick={() => { setShowPayForm(prev => prev === m.id ? null : m.id); if (!payments[m.id]) fetchPayments(m.id) }}
                            style={{ fontSize:11, fontWeight:500, color:'var(--accent)', background:'var(--accent-light)', border:'none', borderRadius:6, padding:'3px 10px', cursor:'pointer' }}
                          >{t('team.addPayment')}</button>
                        </div>

                        {/* Balance summary */}
                        <div style={{ display:'flex', gap:8, marginBottom:8 }}>
                          <div style={{ flex:1, background:'var(--bg-subtle,#F9F8F6)', borderRadius:8, padding:'7px 10px', textAlign:'center' }}>
                            <div style={{ fontSize:11, fontWeight:600, color:'var(--text-primary)' }}>{earned.toLocaleString()} {currSym}</div>
                            <div style={{ fontSize:9, color:'var(--text-muted)' }}>{t('team.earned')}</div>
                          </div>
                          <div style={{ flex:1, background:'var(--bg-subtle,#F9F8F6)', borderRadius:8, padding:'7px 10px', textAlign:'center' }}>
                            <div style={{ fontSize:11, fontWeight:600, color:'var(--success)' }}>{paid.toLocaleString()} {currSym}</div>
                            <div style={{ fontSize:9, color:'var(--text-muted)' }}>{t('team.paidOut')}</div>
                          </div>
                          <div style={{ flex:1, background: balance > 0 ? 'var(--accent-light,#FFF7ED)' : 'var(--success-bg)', borderRadius:8, padding:'7px 10px', textAlign:'center', border:`0.5px solid ${balance > 0 ? 'var(--accent-border)' : 'var(--success-border)'}` }}>
                            <div style={{ fontSize:11, fontWeight:600, color: balance > 0 ? 'var(--accent)' : 'var(--success)' }}>{balance.toLocaleString()} {currSym}</div>
                            <div style={{ fontSize:9, color:'var(--text-muted)' }}>{t('team.balance')}</div>
                          </div>
                        </div>

                        {/* Add payment form */}
                        {showPayForm === m.id && (
                          <div style={{ background:'var(--bg-subtle,#FAFAF9)', border:'0.5px solid var(--border)', borderRadius:8, padding:'10px 12px', marginBottom:10 }}>
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:6 }}>
                              <div>
                                <div style={{ fontSize:10, color:'var(--text-muted)', marginBottom:3 }}>{t('team.dateLabel')}</div>
                                <input type="date" value={pf.date} onChange={e => setPf({ date: e.target.value })}
                                  style={{ width:'100%', fontSize:11, padding:'5px 8px', borderRadius:6, border:'0.5px solid var(--border-medium)', background:'var(--bg)', color:'var(--text-primary)' }} />
                              </div>
                              <div>
                                <div style={{ fontSize:10, color:'var(--text-muted)', marginBottom:3 }}>{t('invoice.subtotalLabel')} ({currSym})</div>
                                <input type="number" min="0" step="any" placeholder="0" value={pf.amount} onChange={e => setPf({ amount: e.target.value })}
                                  style={{ width:'100%', fontSize:11, padding:'5px 8px', borderRadius:6, border:'0.5px solid var(--border-medium)', background:'var(--bg)', color:'var(--text-primary)' }} />
                              </div>
                            </div>
                            <input placeholder={t('expenses.notesPlaceholder')} value={pf.notes} onChange={e => setPf({ notes: e.target.value })}
                              style={{ width:'100%', fontSize:11, padding:'5px 8px', borderRadius:6, border:'0.5px solid var(--border-medium)', background:'var(--bg)', color:'var(--text-primary)', marginBottom:8 }} />
                            <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
                              <button onClick={() => setShowPayForm(null)} style={{ fontSize:11, padding:'5px 12px', borderRadius:6, border:'0.5px solid var(--border)', background:'var(--bg)', cursor:'pointer', color:'var(--text-secondary)' }}>{t('common.cancel')}</button>
                              <button
                                onClick={async () => {
                                  if (!pf.amount) return
                                  await addPayment({ worker_id: m.id, amount: pf.amount, notes: pf.notes, paid_at: pf.date })
                                  setShowPayForm(null)
                                  setPayForm(f => { const n = { ...f }; delete n[m.id]; return n })
                                }}
                                style={{ fontSize:11, padding:'5px 14px', borderRadius:6, background:'var(--accent)', color:'#fff', border:'none', cursor:'pointer', fontWeight:500 }}
                              >{t('common.save')}</button>
                            </div>
                          </div>
                        )}

                        {/* Payment list */}
                        {pays.map(p => (
                          <div key={p.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 0', borderBottom:'0.5px solid var(--border)' }}>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:11, color:'var(--text-primary)' }}>
                                {p.paid_at}
                                <span style={{ fontWeight:600, color:'var(--success)', marginLeft:8 }}>−{parseFloat(p.amount).toLocaleString()} {currSym}</span>
                              </div>
                              {p.notes && <div style={{ fontSize:10, color:'var(--text-muted)' }}>{p.notes}</div>}
                            </div>
                            <button onClick={() => deletePayment(p.id, m.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', fontSize:14, padding:'0 4px', flexShrink:0, display:'flex', alignItems:'center' }}><Trash size={14} weight="bold" /></button>
                          </div>
                        ))}
                        {pays.length === 0 && !showPayForm && (
                          <div style={{ fontSize:11, color:'var(--text-muted)', textAlign:'center', padding:'6px 0' }}>{t('team.noPayments')}</div>
                        )}
                      </div>
                    )
                  })()}

                  {/* ── Remove from team ── */}
                  {profile?.role === 'foreman' && (
                    <div style={{ marginTop:10, paddingTop:10, borderTop:'0.5px solid var(--border)' }}>
                      <button
                        onClick={() => removeWorker(m.id, m.name)}
                        style={{
                          fontSize:12, color:'var(--danger)', background:'var(--danger-bg)',
                          border:'0.5px solid var(--danger-border)', borderRadius:7,
                          padding:'5px 14px', cursor:'pointer', fontWeight:500,
                        }}
                      >
                        {t('team.removeFromTeam')}
                      </button>
                    </div>
                  )}

                  {/* ── Payroll section ── */}
                  {profile?.role === 'foreman' && (
                    <div style={{ marginTop: 12, borderTop: '0.5px solid var(--border)', paddingTop: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                            {t('team.salarySection')}
                          </div>
                          <div style={{ position:'relative' }}>
                            <button
                              onClick={() => {
                                setPickMonth(reportPicker?.workerId === m.id && reportPicker.mode === 'monthly' ? pickMonth : now.getMonth() + 1)
                                setPickYear(reportPicker?.workerId === m.id && reportPicker.mode === 'monthly' ? pickYear : now.getFullYear())
                                setReportPicker(p => (p?.workerId === m.id && p.mode === 'monthly') ? null : { workerId: m.id, mode: 'monthly' })
                              }}
                              style={{ fontSize: 10, color: 'var(--text-secondary)', background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 5, padding: '2px 7px', cursor: 'pointer', display:'flex', alignItems:'center', gap:3 }}
                            ><File size={10} weight="bold" /> {t('team.monthlyReport')}</button>
                            {reportPicker?.workerId === m.id && reportPicker.mode === 'monthly' && (
                              <ReportMonthPicker
                                month={pickMonth} year={pickYear} lang={lang} t={t} showMonth
                                onMonth={setPickMonth} onYear={setPickYear}
                                onClose={() => setReportPicker(null)}
                                onGenerate={() => { generateMonthlyReport(pickMonth, pickYear, m.id); setReportPicker(null) }}
                              />
                            )}
                          </div>
                          <div style={{ position:'relative' }}>
                            <button
                              onClick={() => {
                                setPickYear(reportPicker?.workerId === m.id && reportPicker.mode === 'annual' ? pickYear : now.getFullYear())
                                setReportPicker(p => (p?.workerId === m.id && p.mode === 'annual') ? null : { workerId: m.id, mode: 'annual' })
                              }}
                              style={{ fontSize: 10, color: 'var(--text-secondary)', background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 5, padding: '2px 7px', cursor: 'pointer', display:'flex', alignItems:'center', gap:3 }}
                            ><ChartBar size={10} weight="bold" /> {t('team.annualReport')}</button>
                            {reportPicker?.workerId === m.id && reportPicker.mode === 'annual' && (
                              <ReportMonthPicker
                                year={pickYear} lang={lang} t={t} showMonth={false}
                                onYear={setPickYear}
                                onClose={() => setReportPicker(null)}
                                onGenerate={() => { generateAnnualReport(pickYear, m.id); setReportPicker(null) }}
                              />
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => setShowLogForm(prev => prev === m.id ? null : m.id)}
                          style={{ fontSize: 11, fontWeight: 500, color: 'var(--accent)', background: 'var(--accent-light)', border: 'none', borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}
                        >
                          {t('team.addEntry')}
                        </button>
                      </div>

                      {/* Rate settings */}
                      {rateEditId === m.id ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                          <select
                            value={rateInput.type}
                            onChange={e => setRateInput(r => ({ ...r, type: e.target.value }))}
                            style={{ fontSize: 11, padding: '4px 6px', borderRadius: 6, border: '0.5px solid var(--border-medium)', background: 'var(--bg)', color: 'var(--text-primary)', flex: 1 }}
                          >
                            <option value="shift">{t('team.perShift')}</option>
                            <option value="hours">{t('team.perHour')}</option>
                          </select>
                          <input
                            type="number" min="0" step="any"
                            placeholder={t('team.rateLabel')}
                            value={rateInput.rate}
                            onChange={e => setRateInput(r => ({ ...r, rate: e.target.value }))}
                            style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '0.5px solid var(--border-medium)', background: 'var(--bg)', color: 'var(--text-primary)', width: 90 }}
                          />
                          <button
                            onClick={async () => {
                              await updateMemberRate(m.id, parseFloat(rateInput.rate) || 0, rateInput.type)
                              setRateEditId(null)
                            }}
                            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer' }}
                          >
                            OK
                          </button>
                          <button onClick={() => setRateEditId(null)} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, background: 'var(--bg-subtle,#F5F5F5)', border: '0.5px solid var(--border)', cursor: 'pointer', color: 'var(--text-secondary)', display:'flex', alignItems:'center' }}><X size={11} weight="bold" /></button>
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>{t('team.rateLabel')}: <strong style={{ color: 'var(--text-primary)' }}>{m.default_rate || 0} / {m.rate_type === 'hours' ? t('team.hoursLabel') : t('team.shiftLabel')}</strong></span>
                          <button
                            onClick={() => { setRateEditId(m.id); setRateInput({ rate: m.default_rate || '', type: m.rate_type || 'shift' }) }}
                            style={{ fontSize: 10, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}
                          >
                            {t('team.changeRate')}
                          </button>
                        </div>
                      )}

                      {/* Add log form */}
                      {showLogForm === m.id && (() => {
                        const lf = logForm[m.id] || { date: todayStr(), type: m.rate_type || 'shift', value: '1', rate: m.default_rate || '', notes: '' }
                        const setLf = (patch) => setLogForm(f => ({ ...f, [m.id]: { ...lf, ...patch } }))
                        return (
                          <div style={{ background: 'var(--bg-subtle,#FAFAF9)', border: '0.5px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
                              <div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>{t('team.dateLabel')}</div>
                                <input type="date" value={lf.date} onChange={e => setLf({ date: e.target.value })}
                                  style={{ width: '100%', fontSize: 11, padding: '5px 8px', borderRadius: 6, border: '0.5px solid var(--border-medium)', background: 'var(--bg)', color: 'var(--text-primary)' }} />
                              </div>
                              <div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>{t('team.typeLabel')}</div>
                                <select value={lf.type} onChange={e => setLf({ type: e.target.value })}
                                  style={{ width: '100%', fontSize: 11, padding: '5px 8px', borderRadius: 6, border: '0.5px solid var(--border-medium)', background: 'var(--bg)', color: 'var(--text-primary)' }}>
                                  <option value="shift">{t('team.shiftLabel')}</option>
                                  <option value="hours">{t('team.hoursLabel')}</option>
                                </select>
                              </div>
                              <div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>{lf.type === 'hours' ? t('team.hoursLabel') : t('team.shiftsWord')}</div>
                                <input type="number" min="0" step="any" placeholder={lf.type === 'hours' ? '8' : '1'} value={lf.value} onChange={e => setLf({ value: e.target.value })}
                                  style={{ width: '100%', fontSize: 11, padding: '5px 8px', borderRadius: 6, border: '0.5px solid var(--border-medium)', background: 'var(--bg)', color: 'var(--text-primary)' }} />
                              </div>
                              <div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>{t('team.rateLabel')}</div>
                                <input type="number" min="0" step="any" placeholder="0" value={lf.rate} onChange={e => setLf({ rate: e.target.value })}
                                  style={{ width: '100%', fontSize: 11, padding: '5px 8px', borderRadius: 6, border: '0.5px solid var(--border-medium)', background: 'var(--bg)', color: 'var(--text-primary)' }} />
                              </div>
                            </div>
                            <input placeholder={t('common.none')} value={lf.notes} onChange={e => setLf({ notes: e.target.value })}
                              style={{ width: '100%', fontSize: 11, padding: '5px 8px', borderRadius: 6, border: '0.5px solid var(--border-medium)', background: 'var(--bg)', color: 'var(--text-primary)', marginBottom: 8 }} />
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <button onClick={() => setShowLogForm(null)} style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6, border: '0.5px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', color: 'var(--text-secondary)' }}>{t('common.cancel')}</button>
                              <button
                                onClick={async () => {
                                  if (!lf.value) return
                                  const { profile: p } = useStore.getState()
                                  await addWorkLog({
                                    worker_id: m.id,
                                    project_id: (m.project_ids || [])[0] || null,
                                    log_date: lf.date,
                                    log_type: lf.type,
                                    value: parseFloat(lf.value),
                                    rate: parseFloat(lf.rate) || 0,
                                    notes: lf.notes || null,
                                    created_by: p?.id,
                                  })
                                  setShowLogForm(null)
                                  setLogForm(f => { const n = { ...f }; delete n[m.id]; return n })
                                }}
                                style={{ fontSize: 11, padding: '5px 14px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 500 }}
                              >
                                {t('common.save')}
                              </button>
                            </div>
                          </div>
                        )
                      })()}

                      {/* Log entries — grouped by month */}
                      {(() => {
                        const logs = workLogs[m.id] || []
                        if (logs.length === 0) return (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: '10px 0' }}>{t('team.noEntries')}</div>
                        )

                        // Build month groups: { '2026-05': [log, ...], ... }
                        const monthMap = {}
                        for (const log of logs) {
                          const key = log.log_date ? log.log_date.slice(0, 7) : '__unknown__'
                          if (!monthMap[key]) monthMap[key] = []
                          monthMap[key].push(log)
                        }
                        // Sort months newest first
                        const monthKeys = Object.keys(monthMap).sort((a, b) => b.localeCompare(a))

                        const fmtMonthLabel = (key) => {
                          if (key === '__unknown__') return t('team.unknownDate')
                          const [yr, mo] = key.split('-')
                          const d = new Date(Number(yr), Number(mo) - 1, 1)
                          const label = d.toLocaleDateString(lang, { month: 'long', year: 'numeric' })
                          return label.charAt(0).toUpperCase() + label.slice(1)
                        }

                        const grandTotal = logs.reduce((s, l) => s + (l.value * l.rate), 0)

                        return (
                          <>
                            {/* Grand total chip */}
                            <div style={{ marginBottom: 8, padding: '6px 10px', background: 'var(--accent-light)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{logs.length} {t('team.entriesLabel')} · {monthKeys.length}</span>
                              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--accent)' }}>{grandTotal.toLocaleString()} {currSym}</span>
                            </div>

                            {/* Month groups */}
                            {monthKeys.map(monthKey => {
                              const monthLogs = monthMap[monthKey]
                              const monthTotal = monthLogs.reduce((s, l) => s + (l.value * l.rate), 0)
                              const isMonthOpen = !!(expandedMonths[m.id]?.[monthKey])
                              const toggleMonth = () => setExpandedMonths(prev => ({
                                ...prev,
                                [m.id]: { ...(prev[m.id] || {}), [monthKey]: !isMonthOpen }
                              }))

                              return (
                                <div key={monthKey} style={{ marginBottom: 4, borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
                                  {/* Month header — always visible */}
                                  <div
                                    onClick={toggleMonth}
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', cursor: 'pointer', background: isMonthOpen ? 'var(--surface-2,#FDFBF8)' : 'var(--surface,#fff)', userSelect: 'none' }}
                                  >
                                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>
                                      {fmtMonthLabel(monthKey)}
                                    </span>
                                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{monthLogs.length} {t('team.entriesLabel')}</span>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', marginLeft: 6 }}>{monthTotal.toLocaleString()} {currSym}</span>
                                    {monthKey !== '__unknown__' && (
                                      <button
                                        onClick={e => {
                                          e.stopPropagation()
                                          const [yr, mo] = monthKey.split('-')
                                          generateMonthlyReport(Number(mo), Number(yr), m.id)
                                        }}
                                        title={t('team.monthlyReport')}
                                        style={{ fontSize: 10, color: 'var(--text-secondary)', background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: 5, padding: '2px 6px', marginLeft: 6, cursor: 'pointer', display:'flex', alignItems:'center' }}
                                      ><File size={10} weight="bold" /></button>
                                    )}
                                    <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4, display:'flex', alignItems:'center' }}>{isMonthOpen ? <CaretUp size={10} weight="bold" /> : <CaretDown size={10} weight="bold" />}</span>
                                  </div>

                                  {/* Daily entries */}
                                  {isMonthOpen && (
                                    <div style={{ borderTop: '1px solid var(--border)' }}>
                                      {[...monthLogs].sort((a, b) => (b.log_date || '').localeCompare(a.log_date || '')).map((log, li) => (
                                        <div key={log.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderTop: li > 0 ? '0.5px solid var(--border)' : 'none', background: 'var(--surface,#fff)' }}>
                                          <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 11, color: 'var(--text-primary)' }}>
                                              {log.log_date
                                                ? new Date(log.log_date + 'T00:00:00').toLocaleDateString(lang, { day: 'numeric', month: 'short' })
                                                : '—'
                                              }
                                              <span style={{ color: 'var(--text-secondary)', marginLeft: 6 }}>
                                                {log.log_type === 'hours' ? `${log.value}${t('team.hoursShort')}` : `${log.value} ${t('team.shiftsWord')}`}
                                              </span>
                                              <span style={{ color: 'var(--text-secondary)', marginLeft: 4 }}>× {log.rate}</span>
                                              <span style={{ fontWeight: 500, color: 'var(--accent)', marginLeft: 6 }}>= {(log.value * log.rate).toLocaleString()} {currSym}</span>
                                            </div>
                                            {log.notes && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{log.notes}</div>}
                                          </div>
                                          <button
                                            onClick={() => deleteWorkLog(log.id, m.id)}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, padding: '0 4px', flexShrink: 0, display:'flex', alignItems:'center' }}
                                          ><Trash size={14} weight="bold" /></button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </>
                        )
                      })()}
                    </div>
                  )}

                </div>
              )}
            </div>
          )
        })}
          </div>
        </div>
      )}

      {showAttendance && <AttendanceModal onClose={() => { setShowAttendance(false); useStore.getState().fetchAttendance(todayStr()) }} />}
      {showTimesheet && <TimesheetModal onClose={() => setShowTimesheet(false)} />}
    </div>
  )
}
