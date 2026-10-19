import { useState, useEffect } from 'react'
import { CheckCircle, PencilSimple, ArrowCounterClockwise, Trash, Warning, Clock, MapPin, CalendarBlank, CaretUp, CaretDown, X } from '@phosphor-icons/react'
import { Badge, Button, FormGroup, IconButton, EmptyState, Alert } from '../../components/UI'
import { useT } from '../../i18n/useLanguage'
import { useStore } from '../../store/useStore'
import ConfirmModal from '../../components/ConfirmModal'
import DatePicker from '../../components/DatePicker'
import ProjectDetail from './ProjectDetail'

// ─── EDIT STAGES WIDGET (used inside Edit Project modal) ─────────────────────
function EditStages({ stages, onChange, placeholder }) {
  const [newName,     setNewName]     = useState('')
  const [editingIdx,  setEditingIdx]  = useState(null)
  const [editingName, setEditingName] = useState('')

  const safe = Array.isArray(stages) ? stages : []

  const add = () => {
    const t = newName.trim(); if (!t) return
    onChange([...safe, t]); setNewName('')
  }
  const remove  = (i) => onChange(safe.filter((_, j) => j !== i))
  const move    = (i, d) => {
    const j = i + d; if (j < 0 || j >= safe.length) return
    const next = [...safe]; [next[i], next[j]] = [next[j], next[i]]; onChange(next)
  }
  const startEdit   = (i) => { setEditingIdx(i); setEditingName(safe[i]) }
  const confirmEdit = (i) => {
    const t = editingName.trim()
    if (t && t !== safe[i]) onChange(safe.map((s, j) => j === i ? t : s))
    setEditingIdx(null)
  }

  const row = { display:'flex', alignItems:'center', gap:6, padding:'7px 10px', borderBottom:'1px solid var(--border,#EAE3D8)' }
  const arrowStyle = (dis) => ({
    background:'none', border:'none', cursor: dis ? 'default' : 'pointer',
    fontSize:12, color: dis ? '#D9D0C7' : 'var(--text-muted)', padding:'2px 4px', lineHeight:1,
  })
  const iconStyle = (col='#7A6E66') => ({
    background:'none', border:'none', cursor:'pointer',
    fontSize:13, color:col, padding:'3px 5px', lineHeight:1, borderRadius:5,
  })

  return (
    <div style={{ border:'1.5px solid var(--border,#EAE3D8)', borderRadius:10, overflow:'hidden' }}>
      {safe.length === 0 && (
        <div style={{ padding:'10px 12px', fontSize:12, color:'var(--text-muted)' }}>—</div>
      )}
      {safe.map((s, i) => (
        <div key={i} style={row}>
          {/* Reorder */}
          <div style={{ display:'flex', flexDirection:'column', gap:1, flexShrink:0 }}>
            <button type="button" style={arrowStyle(i===0)} disabled={i===0} onClick={() => move(i,-1)}>▲</button>
            <button type="button" style={arrowStyle(i===safe.length-1)} disabled={i===safe.length-1} onClick={() => move(i,1)}>▼</button>
          </div>
          {/* Number */}
          <div style={{ width:20, height:20, borderRadius:'50%', background:'var(--bg-accent,#F2EDE4)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:500, color:'#7A6E66', flexShrink:0 }}>{i+1}</div>
          {/* Name / input */}
          {editingIdx === i ? (
            <input
              type="text" autoFocus
              value={editingName} onChange={e => setEditingName(e.target.value)}
              onKeyDown={e => { if (e.key==='Enter'){e.preventDefault();confirmEdit(i)} if(e.key==='Escape')setEditingIdx(null) }}
              style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:13, fontWeight:500, fontFamily:'inherit', color:'var(--text-1,#2E2420)' }}
            />
          ) : (
            <span style={{ flex:1, fontSize:13, fontWeight:500, color:'var(--text-1,#2E2420)' }}>{s}</span>
          )}
          {/* Actions */}
          <div style={{ display:'flex', gap:2, flexShrink:0 }}>
            {editingIdx === i ? (
              <>
                <button type="button" style={iconStyle('var(--success)')} onClick={() => confirmEdit(i)}>✓</button>
                <button type="button" style={iconStyle('var(--danger)')} onClick={() => setEditingIdx(null)}>✕</button>
              </>
            ) : (
              <>
                <button type="button" style={iconStyle()} onClick={() => startEdit(i)}>✏️</button>
                <button type="button" style={iconStyle('var(--danger)')} onClick={() => remove(i)}>✕</button>
              </>
            )}
          </div>
        </div>
      ))}
      {/* Add new */}
      <div style={{ display:'flex', gap:0 }}>
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key==='Enter'){e.preventDefault();add()} }}
          placeholder={placeholder}
          style={{ flex:1, border:'none', outline:'none', padding:'9px 12px', fontSize:13, background:'transparent', fontFamily:'inherit', color:'var(--text-1,#2E2420)' }}
        />
        <button
          type="button" onClick={add} disabled={!newName.trim()}
          style={{
            width:42, flexShrink:0, background: newName.trim() ? 'var(--accent)' : 'var(--bg-accent,#F2EDE4)',
            color: newName.trim() ? '#fff' : 'var(--text-muted)',
            border:'none', fontSize:22, cursor: newName.trim() ? 'pointer' : 'default',
            transition:'background .15s, color .15s',
          }}
        >+</button>
      </div>
    </div>
  )
}

// ─── PROJECT CARD LIST ───────────────────────────────────────────────────────
function ProjectCardList({ onSelect, onEdit, onDelete = null, onComplete = null, onReopen = null }) {
  const { t } = useT()
  const { projects, tasks, setSelectedProject, setPendingOpenTask } = useStore()
  const [showCompleted, setShowCompleted] = useState(false)

  const active    = projects.filter(p => p.status !== 'completed')
  const completed = projects.filter(p => p.status === 'completed')

  const [showOverdueModal, setShowOverdueModal] = useState(false)
  const [menuOpenId, setMenuOpenId] = useState(null)

  useEffect(() => {
    const handler = (e) => { if (!e.target.closest('[data-card-menu]')) setMenuOpenId(null) }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  const overdueList   = tasks.filter(t => t.deadline && new Date(t.deadline) < new Date() && t.status !== 'approved')
  const overdueTasks  = overdueList.length
  const pendingReview = tasks.filter(t => t.status === 'pending').length

  const renderCard = (p, isCompleted = false) => {
    const pTasks   = tasks.filter(tk => tk.project_id === p.id)
    const pDone    = pTasks.filter(tk => tk.status === 'approved').length
    const pPct     = pTasks.length === 0 ? 0 : Math.round((pDone / pTasks.length) * 100)
    const pPending = pTasks.filter(tk => tk.status === 'pending').length
    const pOverdue = pTasks.filter(tk => tk.deadline && new Date(tk.deadline) < new Date() && tk.status !== 'approved').length
    const stages   = Array.isArray(p.stages) ? p.stages : []

    const accent = isCompleted ? 'var(--success)' : 'var(--accent)'

    const MAX_PILLS = 3
    const shownStages = stages.slice(0, MAX_PILLS)
    const extraCount  = stages.length - MAX_PILLS

    return (
      <div
        key={p.id}
        onClick={() => onSelect(p.id)}
        className="card-glow"
        style={{
          background: 'var(--bg-card)',
          border: `0.5px solid ${isCompleted ? 'var(--success-border)' : 'var(--border-medium)'}`,
          borderRadius: 16, overflow: 'hidden', cursor: 'pointer',
          boxShadow: 'none',
          opacity: isCompleted ? 0.85 : 1,
          display: 'flex', flexDirection: 'column',
          transition: 'border-color 0.2s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = isCompleted ? 'var(--success-border)' : 'var(--border-medium)' }}
      >
        {/* Top progress line */}
        <div style={{ height: 4, background: 'var(--border-medium)', position: 'relative' }}>
          <div style={{ position:'absolute', inset:0, width:`${pPct}%`, background: `linear-gradient(90deg, ${accent}, var(--accent-hover))`, transition:'width .4s', borderRadius:'0 2px 2px 0' }} />
        </div>

        <div style={{ padding: '14px 14px 12px', display:'flex', flexDirection:'column', flex:1 }}>
          {/* Name + actions */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8, marginBottom:8 }}>
            <div style={{ fontSize:14, fontWeight:500, color: isCompleted ? 'var(--success)' : 'var(--text-1,#1C1917)', lineHeight:1.3, flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:5 }}>{isCompleted && <CheckCircle size={14} weight="bold" color="var(--success)" />}{p.name}</div>
            </div>
            {(onEdit || onDelete || onComplete || onReopen) && (
              <div style={{ position:'relative', flexShrink:0 }} data-card-menu>
                <button
                  onClick={e => { e.stopPropagation(); setMenuOpenId(menuOpenId === p.id ? null : p.id) }}
                  style={{
                    width:28, height:28, border:'0.5px solid var(--border,#EAE3D8)',
                    borderRadius:8, background:'transparent', cursor:'pointer',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    color:'#4A4440', fontSize:16, letterSpacing:2,
                    lineHeight:1, fontFamily:'inherit',
                  }}
                >···</button>
                {menuOpenId === p.id && (
                  <div style={{
                    position:'absolute', top:'calc(100% + 4px)', right:0,
                    background:'var(--bg,#fff)', border:'0.5px solid var(--border,#EAE3D8)',
                    borderRadius:12, boxShadow:'0 8px 24px rgba(0,0,0,0.12)',
                    minWidth:172, zIndex:50, overflow:'hidden',
                  }}>
                    {onEdit && !isCompleted && (
                      <button
                        onClick={e => { e.stopPropagation(); setMenuOpenId(null); onEdit(p) }}
                        style={{ width:'100%', textAlign:'left', display:'flex', alignItems:'center', gap:9, padding:'10px 14px', background:'none', border:'none', cursor:'pointer', fontSize:13, color:'var(--text-1,#2E2420)', fontFamily:'inherit' }}
                        onMouseEnter={e => e.currentTarget.style.background='var(--surface-2,#FDFBF8)'}
                        onMouseLeave={e => e.currentTarget.style.background='none'}
                      ><PencilSimple size={13} weight="bold" /> {t('common.edit')}</button>
                    )}
                    {!isCompleted && onComplete && (
                      <button
                        onClick={e => { e.stopPropagation(); setMenuOpenId(null); onComplete(p.id) }}
                        style={{ width:'100%', textAlign:'left', display:'flex', alignItems:'center', gap:9, padding:'10px 14px', background:'none', border:'none', cursor:'pointer', fontSize:13, color:'var(--success)', fontFamily:'inherit' }}
                        onMouseEnter={e => e.currentTarget.style.background='#F0FAF2'}
                        onMouseLeave={e => e.currentTarget.style.background='none'}
                      ><CheckCircle size={13} weight="bold" /> {t('projects.completeBtn')}</button>
                    )}
                    {isCompleted && onReopen && (
                      <button
                        onClick={e => { e.stopPropagation(); setMenuOpenId(null); onReopen(p.id) }}
                        style={{ width:'100%', textAlign:'left', display:'flex', alignItems:'center', gap:9, padding:'10px 14px', background:'none', border:'none', cursor:'pointer', fontSize:13, color:'var(--text-2,#7A6E66)', fontFamily:'inherit' }}
                        onMouseEnter={e => e.currentTarget.style.background='var(--surface-2,#FDFBF8)'}
                        onMouseLeave={e => e.currentTarget.style.background='none'}
                      ><ArrowCounterClockwise size={13} weight="bold" /> {t('projects.reopenBtn')}</button>
                    )}
                    {onDelete && (
                      <>
                        <div style={{ height:1, background:'var(--border,#EAE3D8)', margin:'2px 0' }} />
                        <button
                          onClick={e => { e.stopPropagation(); setMenuOpenId(null); onDelete(p.id) }}
                          style={{ width:'100%', textAlign:'left', display:'flex', alignItems:'center', gap:9, padding:'10px 14px', background:'none', border:'none', cursor:'pointer', fontSize:13, color:'#DC2626', fontFamily:'inherit' }}
                          onMouseEnter={e => e.currentTarget.style.background='#FEF2F2'}
                          onMouseLeave={e => e.currentTarget.style.background='none'}
                        ><Trash size={13} weight="bold" /> {t('common.delete')}</button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Percentage + subtitle */}
          <div style={{ marginBottom: 10 }}>
            <span style={{ fontSize:22, fontWeight:500, color:accent, fontFamily:'monospace', lineHeight:1 }}>{pPct}%</span>
            <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:3 }}>
              {t('projects.tasksOf', { done: pDone, total: pTasks.length })}
            </div>
          </div>

          {/* Stage pills */}
          {stages.length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:10, alignItems:'center' }}>
              {shownStages.map(s => {
                const sTasks  = pTasks.filter(tk => tk.stage === s)
                const sDone   = sTasks.filter(tk => tk.status === 'approved').length
                const sAlert  = sTasks.filter(tk => tk.status === 'rejected').length
                const full    = sTasks.length > 0 && sDone === sTasks.length
                return (
                  <span key={s} style={{
                    display:'inline-flex', alignItems:'center', gap:4,
                    fontSize:11, fontWeight:500, borderRadius:20, padding:'3px 9px',
                    background: full ? 'var(--accent-light)' : 'var(--bg-subtle)',
                    color:      full ? 'var(--accent-hover)' : 'var(--text-muted)',
                    border:     `1px solid ${full ? 'var(--accent-border)' : 'var(--border-medium)'}`,
                  }}>
                    {s}
                    {sAlert > 0 && (
                      <span style={{ background:'var(--danger-bg)', color:'var(--danger)', borderRadius:10, padding:'0 5px', fontSize:10, fontWeight:500 }}>
                        <Warning size={10} weight="bold" />{sAlert}
                      </span>
                    )}
                  </span>
                )
              })}
              {extraCount > 0 && (
                <span style={{ fontSize:11, color:'var(--text-muted)', fontWeight:500 }}>+{extraCount}</span>
              )}
            </div>
          )}

          {/* Meta: deadline + stages count */}
          <div style={{ display:'flex', flexWrap:'wrap', gap:8, fontSize:11, color:'var(--text-muted)', marginBottom: (pPending > 0 || pOverdue > 0 || (!isCompleted && onComplete)) ? 8 : 0 }}>
            {p.address  && <span style={{ display:'flex', alignItems:'center', gap:2 }}><MapPin size={11} weight="bold" /> {p.address}</span>}
            {p.deadline && <span style={{ display:'flex', alignItems:'center', gap:2 }}><CalendarBlank size={11} weight="bold" /> {p.deadline}</span>}
            {stages.length > 0 && <span>≡ {t('projects.stagesCount', { n: stages.length })}</span>}
          </div>

          {/* Alert chips */}
          {(pPending > 0 || pOverdue > 0) && (
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {pPending > 0 && <span style={{ fontSize:10, background:'var(--warning-bg)', color:'var(--warning)', borderRadius:6, padding:'2px 7px', fontWeight:500, display:'flex', alignItems:'center', gap:2 }}><Clock size={10} weight="bold" /> {pPending}</span>}
              {pOverdue > 0 && <span style={{ fontSize:10, background:'var(--bg-accent)', color:'var(--accent-hover)', border:'0.5px solid var(--accent-border)', boxShadow:'0 0 8px rgba(234,88,12,0.1)', borderRadius:6, padding:'2px 7px', fontWeight:500, display:'flex', alignItems:'center', gap:2 }}><Warning size={10} weight="bold" /> {pOverdue}</span>}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Summary chips */}
      {overdueTasks > 0 && (
        <button
          onClick={() => setShowOverdueModal(true)}
          className="alert-bar"
        >
          <Warning size={13} weight="bold" color="var(--accent)" />
          {t('projects.overdue', { n: overdueTasks })}
        </button>
      )}
      {pendingReview > 0 && (
        <div className="summary-bar" style={{ marginBottom:12 }}>
          <div className="summary-chip warning" style={{ display:'flex', alignItems:'center', gap:4 }}><Clock size={11} weight="bold" /> {t('projects.forReview', { n: pendingReview })}</div>
        </div>
      )}

      {showOverdueModal && (
        <>
          <div
            onClick={() => setShowOverdueModal(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 200 }}
          />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            zIndex: 201, background: 'var(--surface,#fff)', borderRadius: 16,
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)', width: 'min(480px, 92vw)',
            maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: 15, display:'flex', alignItems:'center', gap:5 }}><Warning size={15} weight="bold" /> {t('projects.overdueModalTitle', { n: overdueTasks })}</span>
              <button onClick={() => setShowOverdueModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 1, display:'flex', alignItems:'center' }}><X size={20} weight="bold" /></button>
            </div>
            <div style={{ overflowY: 'auto', padding: '8px 0' }}>
              {overdueList.map(task => {
                const proj = projects.find(p => p.id === task.project_id)
                const daysOverdue = Math.floor((new Date() - new Date(task.deadline)) / 86400000)
                return (
                  <button
                    key={task.id}
                    onClick={() => {
                      setSelectedProject(task.project_id)
                      setPendingOpenTask(task.id)
                      setShowOverdueModal(false)
                    }}
                    style={{
                      width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
                      padding: '10px 18px', borderBottom: '0.5px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 3,
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-light,#FFF3ED)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{task.text}</span>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      {proj && <span style={{ fontSize: 11, color: 'var(--text-secondary)', background: 'var(--bg,#F9F6F0)', borderRadius: 6, padding: '1px 7px' }}>{proj.name}</span>}
                      <span style={{ fontSize: 11, color: 'var(--danger)' }}>{t('projects.overdueByDays', { n: daysOverdue })}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('projects.deadlineColon')} {task.deadline}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}

      {active.length === 0 && completed.length === 0 && <EmptyState>{t('projects.noProjects')}</EmptyState>}

      {/* Active projects grid */}
      {active.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:14, marginBottom:24 }}>
          {active.map(p => renderCard(p, false))}
        </div>
      )}

      {/* Completed section */}
      {completed.length > 0 && (
        <div>
          <button
            onClick={() => setShowCompleted(v => !v)}
            style={{
              display:'flex', alignItems:'center', gap:8, width:'100%',
              background:'none', border:'none', cursor:'pointer', padding:'10px 0',
              borderTop:'1.5px solid var(--border,#EAE3D8)',
            }}
          >
            <span style={{ fontSize:13, fontWeight:500, color:'var(--success)', display:'flex', alignItems:'center', gap:5 }}><CheckCircle size={13} weight="bold" color="var(--success)" /> {t('projects.completedSection')}</span>
            <span style={{ fontSize:12, color:'var(--text-muted)', background:'var(--success-bg)', borderRadius:12, padding:'1px 8px', fontWeight:500 }}>{completed.length}</span>
            <span style={{ marginLeft:'auto', fontSize:11, color:'var(--text-muted)', display:'flex', alignItems:'center' }}>{showCompleted ? <CaretUp size={11} weight="bold" /> : <CaretDown size={11} weight="bold" />}</span>
          </button>
          {showCompleted && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:14, marginTop:10 }}>
              {completed.map(p => renderCard(p, true))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── PROJECTS (two-mode: list ↔ detail) ─────────────────────────────────────
export default function Projects({ canDelete = true, canEdit = true }) {
  const { t } = useT()
  const { projects, tasks, tools, fetchProjects, fetchTasks, fetchTools, updateProject, deleteProject: deleteProjectAction, createProject: createProjectAction, profile, selectedProjectId, setSelectedProject } = useStore()
  const [showAdd,    setShowAdd]    = useState(false)
  const [confirmId,  setConfirmId]  = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [editProject, setEditProject] = useState(null)
  const [editForm,   setEditForm]   = useState({ name:'', stage:'Foundation', deadline:'', address:'', progress:0, stages:[], zones:[] })
  const [editSaving, setEditSaving] = useState(false)
  const [addForm,    setAddForm]    = useState({ name:'', stage:'Foundation', deadline:'', address:'', stages:[], zones:[] })
  const [addError,   setAddError]   = useState('')

  useEffect(() => {
    // fetchProjects must complete first — fetchTasks filters by foreman's project IDs
    fetchProjects().then(() => fetchTasks())
    fetchTools()
  }, [])

  const setA = (field) => (e) => setAddForm(f => ({ ...f, [field]: e.target.value }))
  const setE = (field) => (e) => setEditForm(f => ({ ...f, [field]: e.target.value }))

  const createProject = async () => {
    if (!addForm.name.trim()) return
    setAddError('')
    const { error } = await createProjectAction({
      name: addForm.name,
      deadline: addForm.deadline || null,
      address: addForm.address || null,
      stages: addForm.stages || [],
      zones: addForm.zones || [],
    })
    if (error) {
      setAddError(error === 'limit_projects' ? t('errors.limitProjects') : error === 'locked' ? t('errors.locked') : error)
      return
    }
    setShowAdd(false)
    setAddForm({ name:'', stage:'Foundation', deadline:'', address:'', stages:[], zones:[] })
  }

  const openEdit = (p) => {
    setEditProject(p)
    setEditForm({ name: p.name||'', stage: p.stage||'Foundation', deadline: p.deadline||'', address: p.address||'', progress: p.progress??0, stages: p.stages || [], zones: p.zones || [] })
  }

  const saveEdit = async () => {
    if (!editForm.name.trim()) return
    setEditSaving(true)
    await updateProject(editProject.id, {
      name: editForm.name.trim(),
      deadline: editForm.deadline || null, address: editForm.address || null,
      stages: editForm.stages || [],
      zones: editForm.zones || [],
      // progress is auto-calculated from tasks, not saved here
    })
    setEditSaving(false)
    setEditProject(null)
  }

  const deleteProject = async (id) => {
    setDeleteError('')
    const { error } = await deleteProjectAction(id)
    if (error) { setDeleteError(error === 'locked' ? t('errors.locked') : t('errors.deleteFailed')); return }
    setConfirmId(null)
    if (selectedProjectId === id) setSelectedProject(null)
  }

  const completeProject = (id) => updateProject(id, { status: 'completed' })
  const reopenProject   = (id) => updateProject(id, { status: 'active' })

  const selectedProj = projects.find(p => p.id === selectedProjectId)

  return (
    <div>
      {/* ── Two-mode ── */}
      {!selectedProjectId || !selectedProj ? (
        <>
          <div className="page-header">
            <h1 className="page-title">{t('projects.title')}</h1>
            {canEdit && <Button variant="primary" size="sm" onClick={() => { setAddError(''); setShowAdd(true) }}>{t('projects.add')}</Button>}
          </div>
          {canEdit && projects.length === 0 ? (
            <div style={{ margin:'32px 0', padding:'32px 24px', background:'var(--surface)', border:'1.5px dashed var(--border-medium)', borderRadius:20, textAlign:'center' }}>
              <div style={{ fontSize:20, fontWeight:700, color:'var(--text-primary)', marginBottom:10 }}>{t('projects.welcomeTitle')}</div>
              <div style={{ fontSize:14, color:'var(--text-secondary)', lineHeight:1.6, maxWidth:320, margin:'0 auto 24px' }}>{t('projects.welcomeDesc')}</div>
              <div style={{ display:'flex', flexDirection:'column', gap:12, maxWidth:280, margin:'0 auto' }}>
                {[
                  `${t('projects.add')} — ${t('projects.stagesLabel')}`,
                  `${t('tasks.add')} — ${t('team.title')}`,
                  `${t('account.joinForemanSection')} — ${t('nav.team')}`,
                ].map((label, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:12, background:'var(--bg)', borderRadius:12, padding:'10px 14px', textAlign:'left' }}>
                    <div style={{ width:24, height:24, borderRadius:'50%', background:'var(--accent)', color:'#fff', fontSize:12, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{i + 1}</div>
                    <span style={{ fontSize:13, color:'var(--text-primary)', fontWeight:500 }}>{label}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => { setAddError(''); setShowAdd(true) }}
                style={{ marginTop:28, padding:'14px 32px', borderRadius:14, background:'var(--accent)', color:'#fff', border:'none', fontSize:15, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 16px rgba(201,107,58,0.3)' }}
              >
                {t('projects.createFirstBtn')}
              </button>
            </div>
          ) : (
            <ProjectCardList
              onSelect={(id) => setSelectedProject(id)}
              onEdit={canEdit ? openEdit : null}
              onDelete={canDelete ? (id) => setConfirmId(id) : null}
              onComplete={canEdit ? completeProject : null}
              onReopen={canEdit ? reopenProject : null}
            />
          )}
        </>
      ) : (
        <ProjectDetail
          proj={selectedProj}
          onBack={() => setSelectedProject(null)}
          onEdit={canEdit ? openEdit : null}
          canDelete={canDelete}
          canEdit={canEdit}
        />
      )}

      {/* ── Add Project Modal ── */}
      {showAdd && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="modal" style={{ maxHeight:'90dvh', display:'flex', flexDirection:'column' }}>
            <div className="modal-title">{t('projects.newModal')}</div>
            <div style={{ overflowY:'auto', flex:1 }}>
              <Alert dense>{addError}</Alert>
              <FormGroup label={t('projects.nameLabel')}>
                <input className="form-input" placeholder={t('projects.namePlaceholder')}
                  value={addForm.name} onChange={setA('name')} autoFocus />
              </FormGroup>
              <FormGroup label={t('projects.addressLabel')}>
                <input className="form-input" placeholder={t('projects.addressPlaceholder')}
                  value={addForm.address} onChange={setA('address')} />
              </FormGroup>
              <FormGroup label={t('projects.deadlineLabel')}>
                <DatePicker value={addForm.deadline} onChange={v => setAddForm(f => ({ ...f, deadline: v }))} />
              </FormGroup>
            </div>
            <div className="modal-actions">
              <Button size="sm" onClick={() => setShowAdd(false)}>{t('common.cancel')}</Button>
              <Button variant="primary" size="sm" onClick={createProject}>{t('projects.create')}</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Project Modal ── */}
      {editProject && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditProject(null)}>
          <div className="modal" style={{ maxHeight:'90dvh', display:'flex', flexDirection:'column' }}>
            <div className="modal-title">{t('projects.editModal')}: {editProject.name}</div>
            <div style={{ overflowY:'auto', flex:1 }}>
              <FormGroup label={t('projects.nameLabel')}>
                <input className="form-input" value={editForm.name} onChange={setE('name')} autoFocus />
              </FormGroup>
              <FormGroup label={t('projects.addressLabel')}>
                <input className="form-input" placeholder={t('projects.addressPlaceholder')} value={editForm.address} onChange={setE('address')} />
              </FormGroup>
              <FormGroup label={t('projects.deadlineLabel')}>
                <DatePicker value={editForm.deadline} onChange={v => setEditForm(f => ({ ...f, deadline: v }))} />
              </FormGroup>
              {/* ── Stage manager ── */}
              <FormGroup label={t('projects.stagesLabel')}>
                <EditStages
                  stages={editForm.stages || []}
                  onChange={stages => setEditForm(f => ({ ...f, stages }))}
                  placeholder={t('projects.stagePlaceholder')}
                />
              </FormGroup>
              {/* ── Zone manager (second, independent grouping axis) ── */}
              <FormGroup label={t('projects.zonesLabel')}>
                <EditStages
                  stages={editForm.zones || []}
                  onChange={zones => setEditForm(f => ({ ...f, zones }))}
                  placeholder={t('projects.zonePlaceholder')}
                />
              </FormGroup>
            </div>
            <div className="modal-actions">
              <Button size="sm" onClick={() => setEditProject(null)}>{t('common.cancel')}</Button>
              <Button variant="primary" size="sm" onClick={saveEdit} disabled={editSaving}>
                {editSaving ? t('common.saving') : t('common.save')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Delete ── */}
      {confirmId && (
        <ConfirmModal title={t('projects.deleteTitle')}
          sub={t('projects.deleteSub', { name: projects.find(p => p.id === confirmId)?.name })}
          note={deleteError || null}
          onConfirm={() => deleteProject(confirmId)}
          onCancel={() => { setConfirmId(null); setDeleteError('') }} />
      )}
    </div>
  )
}
