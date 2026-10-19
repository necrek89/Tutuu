import { useState, useEffect, lazy, Suspense } from 'react'
import { PencilSimple } from '@phosphor-icons/react'
import { IconButton } from '../../components/UI'
import { useT } from '../../i18n/useLanguage'
import { useStore } from '../../store/useStore'
import ExpensesTab from '../../components/ExpensesTab'
import ProjectTasksTab from './ProjectTasksTab'
import MaterialsTab from './MaterialsTab'
import PhotosTab from './PhotosTab'
import DocumentsTab from './DocumentsTab'
import ProjectTeamTab from './ProjectTeamTab'

// The invoice builder is big and rarely opened: load it only when asked for.
const InvoiceModal = lazy(() => import('../../components/InvoiceModal'))

// ─── PROJECT DETAIL ──────────────────────────────────────────────────────────
export default function ProjectDetail({ proj, onBack, onEdit, canDelete = true, canEdit = true }) {
  const { t } = useT()
  const { tasks, tools, team, fetchTasks, fetchTools, fetchTeam } = useStore()
  const [tab, setTab] = useState('tasks')
  const [showInvoice, setShowInvoice] = useState(false)
  const TABS = [
    { id:'tasks',     label: t('detail.tasks')     },
    { id:'materials', label: t('detail.materials') },
    { id:'expenses',  label: t('expenses.tab')     },
    { id:'photos',    label: t('detail.photos')    },
    { id:'docs',      label: t('detail.docs')      },
    { id:'team',      label: t('detail.team')      },
  ]

  useEffect(() => {
    fetchTasks(proj.id)
    fetchTools(proj.id)
    fetchTeam(proj.id)
  }, [proj.id])

  const pt       = tasks.filter(tk => tk.project_id === proj.id)
  const ptDone   = pt.filter(tk => tk.status === 'approved').length
  const pct      = pt.length === 0 ? 0 : Math.round((ptDone / pt.length) * 100)
  const workers  = team.length
  const daysLeft = proj.deadline
    ? Math.max(0, Math.ceil((new Date(proj.deadline) - new Date()) / 86400000))
    : null

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4, paddingTop:4 }}>
        <button onClick={onBack} style={{ background:'var(--bg-accent,#F2EDE4)', border:'none', borderRadius:8, padding:'5px 10px', fontSize:12, color:'#7A6E66', cursor:'pointer', flexShrink:0 }}>
          {t('common.back')}
        </button>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:16, fontWeight:700, color:'var(--text-1, #2E2420)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
            {proj.name}
          </div>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowInvoice(true)}
            title={t('invoice.title')}
            className="btn-invoice"
          >
            {t('invoice.title')}
          </button>
        )}
        {onEdit && <IconButton onClick={() => onEdit(proj)} title="Edit project"><PencilSimple size={13} weight="bold" /></IconButton>}
      </div>

      {showInvoice && (
        <Suspense fallback={null}>
          <InvoiceModal
            proj={proj}
            tasks={tasks}
            onClose={() => setShowInvoice(false)}
          />
        </Suspense>
      )}

      {/* ── Progress strip ── */}
      <div style={{ height:4, background:'var(--border, #EAE3D8)', borderRadius:4, overflow:'hidden', marginBottom:0 }}>
        <div style={{ height:4, borderRadius:4, background:'var(--accent)', width:`${pct}%`, transition:'width .4s' }} />
      </div>

      {/* ── Inner tab bar ── */}
      <div className="inner-tab-bar">
        {TABS.map(tb => (
          <button key={tb.id} className={`inner-tab-btn ${tab===tb.id?'active':''}`} onClick={() => setTab(tb.id)}>
            {tb.label}
          </button>
        ))}
      </div>

      {/* ── Stats bento row ── */}
      <div className="stats-bento">
        <div className="stats-bento-cell">
          <div className="stats-bento-val">{pct}%</div>
          <div className="stats-bento-lbl">{t('detail.progress')}</div>
        </div>
        <div className="stats-bento-cell">
          <div className="stats-bento-val neutral">{workers}</div>
          <div className="stats-bento-lbl">{t('detail.workers')}</div>
        </div>
        <div className="stats-bento-cell">
          <div className="stats-bento-val">{daysLeft !== null ? `${daysLeft}d` : '—'}</div>
          <div className="stats-bento-lbl">{t('detail.daysLeft')}</div>
        </div>
        <div className="stats-bento-cell">
          <div className="stats-bento-val neutral">{ptDone}/{pt.length}</div>
          <div className="stats-bento-lbl">{t('detail.tasks')}</div>
        </div>
      </div>

      {/* ── Tab content ── */}
      {tab === 'tasks'     && <ProjectTasksTab proj={proj} canDelete={canDelete} canEdit={canEdit} tools={tools} team={team} />}
      {tab === 'materials' && <MaterialsTab proj={proj} canEdit={canEdit} />}
      {tab === 'expenses'  && <ExpensesTab proj={proj} canEdit={canEdit} />}
      {tab === 'photos'    && <PhotosTab proj={proj} />}
      {tab === 'docs'      && <DocumentsTab proj={proj} />}
      {tab === 'team'      && <ProjectTeamTab proj={proj} canDelete={canDelete} tasks={pt} />}
    </div>
  )
}
