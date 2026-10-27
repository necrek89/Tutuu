import { useState, useEffect } from 'react'
import { Note, Clock, CheckCircle, ArrowCounterClockwise, Package, ShoppingCart, Wrench, HardHat, ChatCircle, ClipboardText, MapPin, CaretRight } from '@phosphor-icons/react'
import { EmptyState } from '../../components/UI'
import { useT } from '../../i18n/useLanguage'
import { useStore } from '../../store/useStore'
import JoinInbox from '../../components/JoinInbox'

// ─── NOTIFICATIONS / ACTIVITY LOG ────────────────────────────────────────────

const ACTIVITY_CFG = {
  task_created:       { icon: Note,                  color:'#2E6FB5', bg:'#E4EEFA', border:'#A3C2E8', darkBg:'#162238', darkBorder:'#1E3A5F', group:'tasks'     },
  task_submitted:     { icon: Clock,                 color:'var(--accent)', bg:'#FBF3DC', border:'#F0D897', darkBg:'#261A0A', darkBorder:'#3D2A0E', group:'tasks'     },
  task_approved:      { icon: CheckCircle,           color:'var(--success)', bg:'var(--success-bg)', border:'var(--success-border)', darkBg:'#0F2018', darkBorder:'#1A3525', group:'tasks'     },
  task_rejected:      { icon: ArrowCounterClockwise, color:'#EF4444', bg:'var(--danger-bg)', border:'var(--danger-border)', darkBg:'#2A1010', darkBorder:'#431515', group:'tasks'     },
  material_added:     { icon: Package,               color:'var(--accent)', bg:'#FBF3DC', border:'#F0D897', darkBg:'#261A0A', darkBorder:'#3D2A0E', group:'materials' },
  material_purchased: { icon: ShoppingCart,          color:'var(--success)', bg:'var(--success-bg)', border:'var(--success-border)', darkBg:'#0F2018', darkBorder:'#1A3525', group:'materials' },
  tool_added:         { icon: Wrench,                color:'#2E6FB5', bg:'#E4EEFA', border:'#A3C2E8', darkBg:'#162238', darkBorder:'#1E3A5F', group:'tools'     },
  worker_joined:      { icon: HardHat,               color:'#9B6FD4', bg:'#F0EAF8', border:'#C4AADF', darkBg:'#1E1530', darkBorder:'#31245C', group:'team'      },
  comment_added:      { icon: ChatCircle,            color:'#7A6E66', bg:'#F2EDE4', border:'#D9D0C7', darkBg:'#2A2520', darkBorder:'#3D342B', group:'tasks'     },
}
const ACTIVITY_CFG_DEFAULT = { icon: ClipboardText, color:'#7A6E66', bg:'#F2EDE4', border:'#D9D0C7', darkBg:'#2A2520', darkBorder:'#3D342B', group:'other' }

const ACTIVITY_GROUPS = ['all', 'tasks', 'materials', 'tools', 'team']

const ACTIVITY_LABELS = {
  ru: {
    all: 'Все', tasks: 'Задачи', materials: 'Материалы', tools: 'Инструменты', team: 'Команда',
    title: 'Активность', none: 'Нет активности',
  },
  en: {
    all: 'All', tasks: 'Tasks', materials: 'Materials', tools: 'Tools', team: 'Team',
    title: 'Activity', none: 'No activity yet',
  },
}
function activityLabel(lang, key) {
  return (ACTIVITY_LABELS[lang] || ACTIVITY_LABELS.en)[key] || (ACTIVITY_LABELS.en)[key]
}

function formatActivityText(e, lang) {
  const a  = e.actor_name || '—'
  const nm = e.entity_name ? `"${e.entity_name}"` : ''
  const m  = e.meta || {}
  const ru = lang === 'ru'

  switch (e.action_type) {
    case 'task_created':       return ru ? `${a} создал(а) задачу ${nm}` : `${a} created task ${nm}`
    case 'task_submitted':     return ru ? `${a} отправил(а) задачу ${nm} на проверку` : `${a} submitted task ${nm} for review`
    case 'task_approved':      return ru ? `${a} принял(а) задачу ${nm}` : `${a} approved task ${nm}`
    case 'task_rejected':      return ru ? `${a} отправил(а) задачу ${nm} на доработку` : `${a} sent task ${nm} for revision`
    case 'material_added':     return ru
      ? `${a} запросил(а) ${m.qty || ''} ${m.unit || ''} — ${e.entity_name || ''}`
      : `${a} requested ${m.qty || ''} ${m.unit || ''} — ${e.entity_name || ''}`
    case 'material_purchased': return ru ? `${a} закупил(а) ${nm}` : `${a} purchased ${nm}`
    case 'tool_added':         return ru ? `${a} добавил(а) инструмент ${nm}` : `${a} added tool ${nm}`
    case 'worker_joined':      return ru ? `${e.entity_name || a} присоединился к команде` : `${e.entity_name || a} joined the team`
    case 'comment_added':      return ru ? `${a} прокомментировал(а) задачу ${nm}` : `${a} commented on task ${nm}`
    default:                   return `${a} — ${e.action_type}`
  }
}

function formatActivityTime(dateStr, lang) {
  if (!dateStr) return ''
  const d    = new Date(dateStr)
  const diff = (Date.now() - d) / 1000
  const ru   = lang === 'ru'
  if (diff < 60)         return ru ? 'только что' : 'just now'
  if (diff < 3600)       return ru ? `${Math.floor(diff / 60)} мин` : `${Math.floor(diff / 60)}m ago`
  if (diff < 86400)      return ru ? `${Math.floor(diff / 3600)} ч` : `${Math.floor(diff / 3600)}h ago`
  if (diff < 86400 * 7)  return ru ? `${Math.floor(diff / 86400)} д` : `${Math.floor(diff / 86400)}d ago`
  return new Intl.DateTimeFormat(lang === 'ru' ? 'ru' : 'en', { day: 'numeric', month: 'short' }).format(d)
}

export default function Notifications({ onNavigate }) {
  const { lang } = useT()
  const { activityLog, fetchActivityLog, setSelectedProject, setPendingOpenTask, theme } = useStore()
  const dark = theme === 'dark'
  const [filter, setFilter] = useState('all')

  const TASK_ENTRY_TYPES = new Set(['task_created','task_submitted','task_approved','task_rejected','comment_added'])

  const handleEntryClick = (entry) => {
    if (!TASK_ENTRY_TYPES.has(entry.action_type)) return
    if (!entry.entity_id || !entry.project_id) return
    setSelectedProject(entry.project_id)
    setPendingOpenTask(entry.entity_id)
    onNavigate?.('projects')
  }

  useEffect(() => { fetchActivityLog() }, [])

  const counts = ACTIVITY_GROUPS.reduce((acc, g) => {
    acc[g] = g === 'all'
      ? activityLog.length
      : activityLog.filter(e => (ACTIVITY_CFG[e.action_type] || ACTIVITY_CFG_DEFAULT).group === g).length
    return acc
  }, {})

  const filtered = filter === 'all'
    ? activityLog
    : activityLog.filter(e => (ACTIVITY_CFG[e.action_type] || ACTIVITY_CFG_DEFAULT).group === filter)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{activityLabel(lang, 'title')}</h1>
      </div>

      <JoinInbox />

      {/* Filter bar */}
      <div className="filter-bar" style={{ flexWrap:'wrap', gap:6 }}>
        {ACTIVITY_GROUPS.map(g => (
          <button key={g} className={`filter-btn ${filter === g ? 'active' : ''}`} onClick={() => setFilter(g)}>
            {activityLabel(lang, g)}{counts[g] > 0 ? ` · ${counts[g]}` : ''}
          </button>
        ))}
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {filtered.length === 0 && <EmptyState>{activityLabel(lang, 'none')}</EmptyState>}

        {filtered.map(entry => {
          const cfg = ACTIVITY_CFG[entry.action_type] || ACTIVITY_CFG_DEFAULT
          const isClickable = TASK_ENTRY_TYPES.has(entry.action_type) && entry.entity_id && entry.project_id
          const cardBg     = dark ? cfg.darkBg     : cfg.bg
          const cardBorder = dark ? cfg.darkBorder : cfg.border
          return (
            <div key={entry.id}
              onClick={() => handleEntryClick(entry)}
              style={{
                display:'flex', alignItems:'flex-start', gap:12,
                background: cardBg,
                border: `1.5px solid ${cardBorder}`,
                borderRadius: 14, padding:'12px 14px',
                cursor: isClickable ? 'pointer' : 'default',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => { if (isClickable) e.currentTarget.style.opacity = '0.82' }}
              onMouseLeave={e => { if (isClickable) e.currentTarget.style.opacity = '1' }}
            >
              {/* Icon */}
              <div style={{
                width:40, height:40, borderRadius:'50%', flexShrink:0,
                background: cardBorder, border:`1.5px solid ${cardBorder}`,
                display:'flex', alignItems:'center', justifyContent:'center',
              }}>
                <cfg.icon size={14} weight="bold" color={cfg.color} />
              </div>

              {/* Content */}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, color:'var(--text-1)', lineHeight:1.5, fontWeight:500 }}>
                  {formatActivityText(entry, lang)}
                </div>

                <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:6, flexWrap:'wrap' }}>
                  {/* Project badge */}
                  {entry.project?.name && (
                    <span style={{
                      fontSize:11, color:cfg.color, fontWeight:600,
                      background: cardBorder, border:`1px solid ${cardBorder}`,
                      borderRadius:7, padding:'2px 8px',
                      display:'flex', alignItems:'center', gap:3,
                    }}>
                      <MapPin size={11} weight="bold" /> {entry.project.name}
                    </span>
                  )}
                  {/* Time — pushed to the right */}
                  <span style={{ marginLeft:'auto', fontSize:11, color:'var(--text-muted)', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:4 }}>
                    {formatActivityTime(entry.created_at, lang)}
                    {isClickable && <CaretRight size={12} weight="bold" color={cfg.color} />}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
