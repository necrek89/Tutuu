import { useState, useEffect } from 'react'
import { X, CaretLeft, CaretRight, CalendarBlank, HardHat, Buildings, PencilSimple, Trash, CaretUp, CaretDown, ArrowCounterClockwise, Package, Check } from '@phosphor-icons/react'
import { Badge, Button, IconButton } from '../../components/UI'
import { useT } from '../../i18n/useLanguage'
import { displayUnit } from '../../i18n/units'
import { useStore, currencySymbol } from '../../store/useStore'
import TaskComments from '../../components/TaskComments'
import MaterialModal from '../../components/MaterialModal'
import MaterialList from '../../components/MaterialList'
import MaterialRequestModal from '../../components/MaterialRequestModal'

// ─── MEDIA LIGHTBOX ──────────────────────────────────────────────────────────
function MediaLightbox({ urls, startIndex, onClose }) {
  const [idx, setIdx] = useState(startIndex)
  const isVideo = (u) => /\.(mp4|mov|webm|avi|mkv)$/i.test(u)
  const url = urls[idx]

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape')     onClose()
      if (e.key === 'ArrowRight') setIdx(i => Math.min(i + 1, urls.length - 1))
      if (e.key === 'ArrowLeft')  setIdx(i => Math.max(i - 1, 0))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [urls.length])

  return (
    <div
      onClick={onClose}
      style={{ position:'fixed', inset:0, zIndex:500, background:'rgba(0,0,0,0.92)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}
    >
      <button onClick={onClose} style={{ position:'absolute', top:16, right:16, background:'rgba(255,255,255,0.15)', border:'none', borderRadius:'50%', width:36, height:36, color:'#fff', fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}><X size={18} weight="bold" /></button>
      {urls.length > 1 && (
        <div style={{ position:'absolute', top:20, left:'50%', transform:'translateX(-50%)', color:'rgba(255,255,255,0.6)', fontSize:13 }}>{idx + 1} / {urls.length}</div>
      )}
      <div onClick={e => e.stopPropagation()} style={{ maxWidth:'94vw', maxHeight:'80dvh', display:'flex', alignItems:'center', justifyContent:'center' }}>
        {isVideo(url) ? (
          <video key={url} src={url} controls autoPlay style={{ maxWidth:'94vw', maxHeight:'80dvh', borderRadius:10 }} />
        ) : (
          <img key={url} src={url} alt="" style={{ maxWidth:'94vw', maxHeight:'80dvh', borderRadius:10, objectFit:'contain' }} />
        )}
      </div>
      {urls.length > 1 && (
        <>
          <button onClick={e => { e.stopPropagation(); setIdx(i => Math.max(i - 1, 0)) }} disabled={idx === 0}
            style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', background:'rgba(255,255,255,0.15)', border:'none', borderRadius:'50%', width:40, height:40, color:'#fff', fontSize:20, cursor:'pointer', opacity: idx === 0 ? 0.3 : 1, display:'flex', alignItems:'center', justifyContent:'center' }}><CaretLeft size={20} weight="bold" /></button>
          <button onClick={e => { e.stopPropagation(); setIdx(i => Math.min(i + 1, urls.length - 1)) }} disabled={idx === urls.length - 1}
            style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'rgba(255,255,255,0.15)', border:'none', borderRadius:'50%', width:40, height:40, color:'#fff', fontSize:20, cursor:'pointer', opacity: idx === urls.length - 1 ? 0.3 : 1, display:'flex', alignItems:'center', justifyContent:'center' }}><CaretRight size={20} weight="bold" /></button>
        </>
      )}
      {urls.length > 1 && (
        <div style={{ position:'absolute', bottom:24, display:'flex', gap:6 }}>
          {urls.map((_, i) => (
            <div key={i} onClick={e => { e.stopPropagation(); setIdx(i) }} style={{ width:7, height:7, borderRadius:'50%', background: i === idx ? '#fff' : 'rgba(255,255,255,0.35)', cursor:'pointer' }} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── TASK MEDIA THUMBNAILS ───────────────────────────────────────────────────
export function TaskMedia({ urls }) {
  const [lightbox, setLightbox] = useState(null)
  if (!urls) return null
  const list = urls.split(',').filter(Boolean)
  if (!list.length) return null
  const isVideo = (u) => /\.(mp4|mov|webm|avi|mkv)$/i.test(u)
  return (
    <>
      <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:8 }}>
        {list.map((url, i) => (
          <div key={i} onClick={() => setLightbox(i)} style={{ position:'relative', cursor:'pointer', flexShrink:0 }}>
            {isVideo(url)
              ? <div style={{ width:72, height:72, borderRadius:8, border:'1px solid #EAE3D8', background:'#111', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:22 }}>▶</div>
              : <img src={url} alt="" style={{ width:72, height:72, objectFit:'cover', borderRadius:8, border:'1px solid #EAE3D8', display:'block' }} />
            }
          </div>
        ))}
      </div>
      {lightbox !== null && <MediaLightbox urls={list} startIndex={lightbox} onClose={() => setLightbox(null)} />}
    </>
  )
}

// ─── TASK MATERIAL SECTION (shown inside an expanded task card) ──────────────
function TaskMaterialSection({ task }) {
  const { t } = useT()
  const { materials, role, profile, projects,
          markMaterialPurchased, markMaterialNeeded, deleteMaterial } = useStore()
  const [showModal, setShowModal] = useState(false)

  const taskMaterials = materials.filter(m => m.taskId === task.id)
  const openCount     = taskMaterials.filter(m => m.status === 'needed').length

  const toggle = (id) => {
    const m = materials.find(x => x.id === id)
    if (!m) return
    m.status === 'needed' ? markMaterialPurchased(id) : markMaterialNeeded(id)
  }

  const handleDelete = (id) => {
    const m = materials.find(x => x.id === id)
    if (!m) return
    const isOwner = m.reportedById ? m.reportedById === profile?.id : m.reportedBy === profile?.name
    if (role === 'foreman' || isOwner) deleteMaterial(id)
  }

  return (
    <>
      <div style={{ height:1, background:'var(--border,#EAE3D8)', margin:'10px 0 8px' }} />
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color:'var(--text-muted)', display:'flex', alignItems:'center', gap:6 }}>
          <Package size={11} weight="bold" /> {t('materials.title')}
          {openCount > 0 && (
            <span style={{ background:'var(--danger-bg)', color:'var(--danger)', fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:8 }}>
              {t('materials.needed', { n: openCount })}
            </span>
          )}
        </div>
        <button
          onClick={e => { e.stopPropagation(); setShowModal(true) }}
          style={{ fontSize:11, fontWeight:600, color:'var(--accent)', background:'var(--accent-light)', border:'none', borderRadius:8, padding:'4px 10px', cursor:'pointer' }}
        >
          {t('materials.reportShortage')}
        </button>
      </div>

      <MaterialList
        materials={taskMaterials}
        showProject={false}
        projects={projects}
        onTogglePurchased={(role === 'foreman' || role === 'manager') ? toggle : undefined}
        onDelete={handleDelete}
        role={role}
        profile={profile}
      />

      {showModal && (
        <MaterialModal
          open={showModal}
          onClose={() => setShowModal(false)}
          defaultProjectId={task.project_id}
          defaultTaskId={task.id}
        />
      )}
    </>
  )
}

// ─── TASK ACCORDION CARD ─────────────────────────────────────────────────────
export default function TaskCard({ t, openId, setOpenId, onEdit, onDelete, onApprove, onReject, onMarkDone, showProject, projects }) {
  const { t: tr, lang } = useT()
  const { role, profile, addMaterialRequest, tasks: storeTasks } = useStore()
  const isOpen = openId === t.id
  const projName = showProject && projects ? projects.find(p => p.id === t.project_id)?.name : null

  const [showReqModal, setShowReqModal] = useState(false)
  const [reqSent, setReqSent]           = useState(false)

  const handleReqSave = async (payload, photoFile) => {
    const result = await addMaterialRequest(payload, photoFile)
    if (!result.error) {
      setReqSent(true)
      setTimeout(() => setReqSent(false), 2000)
      setShowReqModal(false)
    }
    return result
  }

  // Tasks for the same project (for the dropdown in modal)
  const projectTasks = storeTasks.filter(tk => tk.project_id === t.project_id)

  return (
    <div id={`task-card-${t.id}`} style={{
      background: 'var(--surface, #fff)',
      border: `1.5px solid ${isOpen ? 'var(--accent)' : 'var(--border-medium)'}`,
      borderRadius: 10, overflow: 'hidden',
      boxShadow: isOpen ? '0 3px 10px rgba(201,107,58,0.10)' : 'none',
      transition: 'border-color .15s, box-shadow .15s',
    }}>
      <div onClick={() => setOpenId(prev => prev === t.id ? null : t.id)}
        style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', cursor:'pointer', background: isOpen ? 'var(--accent-light)' : 'var(--bg-card)' }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:600, color: isOpen ? 'var(--accent)' : 'var(--text-primary)', marginBottom:4, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
            {t.text}
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:4, alignItems:'center' }}>
            {t.stage && t.stage !== '—' && <Badge variant="gray">{t.stage}</Badge>}
            {t.zone  && t.zone  !== '—' && <Badge variant="blue">{t.zone}</Badge>}
            {t.quantity != null && t.unit && (
              <span style={{ fontSize:10, background:'var(--info-bg)', color:'var(--info)', borderRadius:5, padding:'1px 6px', fontWeight:600 }}>
                {t.quantity} {displayUnit(t.unit, lang)}
              </span>
            )}
            {t.cost != null && (
              <span style={{ fontSize:10, background:'var(--success-bg)', color:'var(--success)', borderRadius:5, padding:'1px 6px', fontWeight:600 }}>
                {t.currency || currencySymbol(profile?.currency)} {Number(t.cost).toLocaleString('ru-RU')}
              </span>
            )}
            {t.deadline && <span style={{ fontSize:10, color:'var(--text-muted)', display:'flex', alignItems:'center', gap:2 }}><CalendarBlank size={10} weight="bold" /> {t.deadline}</span>}
            {t.worker   && <span style={{ fontSize:10, color:'var(--text-muted)', display:'flex', alignItems:'center', gap:2 }}><HardHat size={10} weight="bold" /> {t.worker.name}</span>}
            {projName   && <span style={{ fontSize:10, color:'var(--text-muted)', display:'flex', alignItems:'center', gap:2 }}><Buildings size={10} weight="bold" /> {projName}</span>}
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:3, flexShrink:0 }}>
          {onEdit   && <IconButton onClick={e => { e.stopPropagation(); onEdit(t) }}><PencilSimple size={13} weight="bold" /></IconButton>}
          {onDelete && <IconButton className="danger" onClick={e => { e.stopPropagation(); onDelete(t.id) }}><Trash size={13} weight="bold" /></IconButton>}
          <span style={{ fontSize:10, color:'var(--text-muted)', marginLeft:2, display:'flex', alignItems:'center' }}>{isOpen ? <CaretUp size={10} weight="bold" /> : <CaretDown size={10} weight="bold" />}</span>
        </div>
      </div>
      {isOpen && (
        <div style={{ borderTop:'1px solid var(--border, #EAE3D8)', padding:'12px 13px', background:'var(--surface-2, #FDFBF8)' }}>
          {t.description
            ? <div style={{ fontSize:13, color:'var(--text-1, #2E2420)', lineHeight:1.65, whiteSpace:'pre-wrap', marginBottom:10 }}>{t.description}</div>
            : <div style={{ fontSize:12, color:'var(--text-muted)', marginBottom:10 }}>{tr('tasks.noDesc')}</div>
          }
          <TaskMedia urls={t.photo_url} />
          {t.status === 'rejected' && t.reject_comment && (
            <div style={{ marginTop:10, fontSize:12, color:'var(--danger)', background:'var(--danger-bg)', padding:'6px 10px', borderRadius:7, display:'flex', alignItems:'center', gap:4 }}><ArrowCounterClockwise size={12} weight="bold" /> {t.reject_comment}</div>
          )}
          {/* Foreman actions */}
          <div style={{ marginTop:12, display:'flex', gap:8, flexWrap:'wrap' }}>
            {t.status === 'pending' && onApprove && (
              <>
                <Button size="sm" variant="primary" onClick={() => onApprove(t.id)}>{tr('tasks.approve')}</Button>
                <Button size="sm" variant="danger"  onClick={() => onReject(t.id)}>{tr('tasks.reject')}</Button>
              </>
            )}
            {t.status !== 'approved' && onMarkDone && (
              <button
                onClick={() => onMarkDone(t.id)}
                style={{
                  fontSize:12, fontWeight:600, padding:'5px 12px', borderRadius:8,
                  background:'var(--success-bg)', color:'var(--success)', border:'1px solid var(--success-border)',
                  cursor:'pointer',
                }}
              >
                {tr('tasks.markDone')}
              </button>
            )}
          </div>
          <TaskMaterialSection task={t} />

          {/* Worker: request material button */}
          {role === 'worker' && t.status !== 'approved' && (
            <div style={{ marginTop: 10 }}>
              <button
                onClick={e => { e.stopPropagation(); setShowReqModal(true) }}
                style={{
                  fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 8,
                  background: reqSent ? 'var(--success-bg)' : 'var(--info-bg)',
                  color:      reqSent ? 'var(--success)' : 'var(--info)',
                  border:     `1px solid ${reqSent ? 'var(--success-border)' : 'var(--info-border)'}`,
                  cursor: 'pointer', transition: 'all .15s',
                }}
              >
                {reqSent ? <><Check size={12} weight="bold" /> Sent</> : <><Package size={12} weight="bold" /> Request material</>}
              </button>
            </div>
          )}

          <TaskComments taskId={t.id} />
        </div>
      )}

      {showReqModal && (
        <MaterialRequestModal
          projectId={t.project_id}
          taskId={t.id}
          tasks={projectTasks}
          showTaskLink={true}
          onClose={() => setShowReqModal(false)}
          onSave={handleReqSave}
        />
      )}
    </div>
  )
}
