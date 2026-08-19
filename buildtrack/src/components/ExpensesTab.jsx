import { useState, useEffect } from 'react'
import { CalendarBlank, PencilSimple, Trash, CaretUp, CaretDown, X } from '@phosphor-icons/react'
import { useStore, currencySymbol } from '../store/useStore'
import { useT } from '../i18n/useLanguage'
import { Button, EmptyState } from './UI'
import AddExpenseModal, { CATEGORY_ICONS } from './AddExpenseModal'

function fmtMoney(amount, currency = 'USD') {
  const sym = currencySymbol(currency)
  return `${sym}${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

const CATEGORIES = ['materials', 'labor', 'equipment', 'transport', 'other']

const CAT_COLORS = {
  materials: { bg: 'var(--cat-materials-bg)', color: 'var(--cat-materials-fg)', border: 'var(--cat-materials-bd)', bar: 'var(--cat-materials-bar)' },
  labor:     { bg: 'var(--cat-labor-bg)',     color: 'var(--cat-labor-fg)',     border: 'var(--cat-labor-bd)',     bar: 'var(--cat-labor-bar)'     },
  equipment: { bg: 'var(--cat-equipment-bg)', color: 'var(--cat-equipment-fg)', border: 'var(--cat-equipment-bd)', bar: 'var(--cat-equipment-bar)' },
  transport: { bg: 'var(--cat-transport-bg)', color: 'var(--cat-transport-fg)', border: 'var(--cat-transport-bd)', bar: 'var(--cat-transport-bar)' },
  other:     { bg: 'var(--cat-other-bg)',     color: 'var(--cat-other-fg)',     border: 'var(--cat-other-bd)',     bar: 'var(--cat-other-bar)'     },
}

// ── Single expense card ─────────────────────────────────────────────────────
function ExpenseCard({ exp, canEdit, onEdit, onDelete, onLightbox, deleting, t }) {
  const colors = CAT_COLORS[exp.category] || CAT_COLORS.other
  return (
    <div style={{
      background: 'var(--surface,#fff)',
      border: '1.5px solid var(--border,#EAE3D8)',
      borderRadius: 12, overflow: 'hidden',
      opacity: deleting === exp.id ? 0.5 : 1,
      transition: 'opacity .2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px' }}>
        {/* Category icon */}
        <div style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0,
          background: colors.bg, border: `1px solid ${colors.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
        }}>
          {(() => { const IC = CATEGORY_ICONS[exp.category] || CATEGORY_ICONS.other; return <IC size={18} weight="bold" /> })()}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1,#2E2420)', lineHeight: 1.3 }}>
              {exp.title}
            </div>
            <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--danger)', flexShrink: 0 }}>
              {fmtMoney(exp.amount, exp.currency)}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', display:'flex', alignItems:'center', gap:2 }}><CalendarBlank size={11} weight="bold" /> {fmtDate(exp.date)}</span>
          </div>
          {exp.notes && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 5, lineHeight: 1.5 }}>
              {exp.notes}
            </div>
          )}
        </div>

        {/* Receipt thumbnail */}
        {exp.receipt_url && (
          <div onClick={() => onLightbox(exp.receipt_url)}
            style={{ width: 52, height: 52, borderRadius: 8, overflow: 'hidden',
              flexShrink: 0, cursor: 'pointer', border: '1px solid var(--border,#EAE3D8)' }}>
            <img src={exp.receipt_url} alt="receipt"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}
      </div>

      {canEdit && (
        <div style={{
          display: 'flex', gap: 8, padding: '8px 14px 10px',
          borderTop: '1px solid var(--border,#F2EDE6)',
          background: 'var(--surface-2,#FDFBF8)',
        }}>
          <button onClick={() => onEdit(exp)} style={{
            flex: 1, padding: '5px', borderRadius: 7, fontSize: 12, fontWeight: 600,
            border: '1.5px solid var(--border,#EAE3D8)',
            background: 'var(--surface,#fff)', color: 'var(--text-secondary)', cursor: 'pointer',
          }}><PencilSimple size={12} weight="bold" /> {t('common.edit')}</button>
          <button onClick={() => onDelete(exp)} disabled={deleting === exp.id} style={{
            flex: 1, padding: '5px', borderRadius: 7, fontSize: 12, fontWeight: 600,
            border: '1.5px solid var(--danger-border)', background: 'var(--danger-bg)', color: 'var(--danger)', cursor: 'pointer',
          }}><Trash size={12} weight="bold" /> {t('common.delete')}</button>
        </div>
      )}
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────
export default function ExpensesTab({ proj, canEdit = true }) {
  const { t } = useT()
  const { expenses, fetchExpenses, addExpense, updateExpense, deleteExpense, profile } = useStore()
  const [showAdd,     setShowAdd]     = useState(false)
  const [editExpense, setEditExpense] = useState(null)
  const [lightbox,    setLightbox]    = useState(null)
  const [deleting,    setDeleting]    = useState(null)
  const [openCats,    setOpenCats]    = useState({}) // for grouped view collapse

  useEffect(() => { fetchExpenses(proj.id) }, [proj.id])

  const projExpenses = expenses.filter(e => e.project_id === proj.id)

  // Total per currency
  const totals = projExpenses.reduce((acc, e) => {
    acc[e.currency || 'USD'] = (acc[e.currency || 'USD'] || 0) + Number(e.amount)
    return acc
  }, {})
  const profileCurrency = profile?.currency || 'USD'
  const totalStr = Object.entries(totals)
    .map(([cur, amt]) => fmtMoney(amt, cur))
    .join(' + ') || fmtMoney(0, profileCurrency)

  const groups = CATEGORIES.map(cat => {
    const items = projExpenses.filter(e => e.category === cat)
    return {
      cat,
      items,
      total: items.reduce((s, e) => s + Number(e.amount), 0),
      cur:   items[0]?.currency || 'USD',
    }
  }).filter(g => g.items.length > 0)

  const toggleCat = (cat) => setOpenCats(prev => ({ ...prev, [cat]: !prev[cat] }))

  const handleDelete = async (exp) => {
    if (!window.confirm(t('expenses.deleteConfirm'))) return
    setDeleting(exp.id)
    await deleteExpense(exp.id)
    setDeleting(null)
  }

  const cardProps = { canEdit, onEdit: setEditExpense, onDelete: handleDelete, onLightbox: setLightbox, deleting, t }

  return (
    <div style={{ paddingBottom: 28 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, marginTop: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>
            {t('expenses.totalLabel')}
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--danger)', lineHeight: 1.2, marginTop: 2 }}>
            {totalStr}
          </div>
        </div>
        {canEdit && (
          <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>+ {t('expenses.addBtn')}</Button>
        )}
      </div>

      {/* ── Empty state ── */}
      {projExpenses.length === 0 && <EmptyState>{t('expenses.empty')}</EmptyState>}

      {/* ── Grouped view ── */}
      {groups.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {groups.map(({ cat, items, total, cur }) => {
            const c      = CAT_COLORS[cat] || CAT_COLORS.other
            const isOpen = openCats[cat] !== false // default open
            return (
              <div key={cat} style={{
                borderRadius: 12, overflow: 'hidden',
                border: `1.5px solid ${c.border}`,
              }}>
                {/* Group header */}
                <div
                  onClick={() => toggleCat(cat)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '11px 14px', cursor: 'pointer',
                    background: c.bg,
                  }}
                >
                  <span style={{ fontSize: 18, flexShrink: 0, display: 'flex' }}>
                    {(() => { const IC = CATEGORY_ICONS[cat]; return <IC size={18} weight="bold" /> })()}
                  </span>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: c.color }}>
                      {t(`expenses.cat_${cat}`)}
                    </span>
                    <span style={{ fontSize: 11, color: c.color, opacity: .65, marginLeft: 6 }}>
                      ({items.length})
                    </span>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--danger)', flexShrink: 0 }}>
                    {fmtMoney(total, cur)}
                  </span>
                  <span style={{ fontSize: 11, color: c.color, opacity: .7, marginLeft: 4, display:'flex', alignItems:'center' }}>
                    {isOpen ? <CaretUp size={11} weight="bold" /> : <CaretDown size={11} weight="bold" />}
                  </span>
                </div>

                {/* Items */}
                {isOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {items.map((exp, i) => (
                      <div key={exp.id} style={{ borderTop: i > 0 ? '1px solid var(--border,#F2EDE6)' : '1px solid var(--border,#EAE3D8)' }}>
                        <ExpenseCard exp={exp} {...cardProps} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Receipt lightbox ── */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{
          position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <button onClick={() => setLightbox(null)} style={{
            position: 'absolute', top: 16, right: 16,
            background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%',
            width: 36, height: 36, color: '#fff', fontSize: 18, cursor: 'pointer',
            display:'flex', alignItems:'center', justifyContent:'center',
          }}><X size={18} weight="bold" /></button>
          <img src={lightbox} alt="receipt" onClick={e => e.stopPropagation()}
            style={{ maxWidth: '94vw', maxHeight: '88dvh', borderRadius: 10, objectFit: 'contain' }} />
        </div>
      )}

      {/* ── Modals ── */}
      {showAdd && (
        <AddExpenseModal projectId={proj.id}
          onClose={() => setShowAdd(false)}
          onSave={(p, f) => addExpense(p, f)} />
      )}
      {editExpense && (
        <AddExpenseModal projectId={proj.id} expense={editExpense}
          onClose={() => setEditExpense(null)}
          onSave={(p, f) => updateExpense(editExpense.id, p, f)} />
      )}
    </div>
  )
}
