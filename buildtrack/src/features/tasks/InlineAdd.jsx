import { useState, useEffect, useRef } from 'react'
import { useT } from '../../i18n/useLanguage'
import translations from '../../i18n/translations'
import { unitLabel } from '../../i18n/units'
import { useStore, currencySymbol } from '../../store/useStore'
import { Plus, Check, X } from '@phosphor-icons/react'

export default function QuickAddRow({ stage, onAdd, isOpen, onOpen, onClose }) {
  const { t, lang } = useT()
  // Same unit list as TaskModal, compact display (short code only). Option
  // values are the canonical English code so it stores/displays correctly
  // regardless of language, per src/i18n/units.js.
  const LOCAL_UNITS = translations[lang]?.tasks?.units || translations.en.tasks.units
  const UNIT_OPTIONS = translations.en.tasks.units.map((u, i) => ({ value: u.value, label: LOCAL_UNITS[i]?.value || '—' }))
  const profile  = useStore(s => s.profile)
  const currSym  = currencySymbol(profile?.currency)

  const [name,      setName]      = useState('')
  const [qty,       setQty]       = useState('')
  const [unit,      setUnit]      = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [busy,      setBusy]      = useState(false)
  const nameRef = useRef()
  const rowRef  = useRef()

  const qtyNum   = parseFloat(qty)
  const priceNum = parseFloat(unitPrice)
  const totalCost = (!isNaN(qtyNum) && qtyNum > 0 && !isNaN(priceNum) && priceNum > 0)
    ? Math.round(qtyNum * priceNum * 100) / 100
    : null

  useEffect(() => {
    if (isOpen) setTimeout(() => nameRef.current?.focus(), 0)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) { setName(''); setQty(''); setUnit(''); setUnitPrice('') }
  }, [isOpen])

  const submit = async () => {
    const text = name.trim()
    if (!text || busy) return
    setBusy(true)
    await onAdd({
      text, stage,
      qty:  qty !== '' ? Number(qty) : null,
      unit: unit || null,
      cost: totalCost,
    })
    setName(''); setQty(''); setUnit(''); setUnitPrice('')
    setBusy(false)
    nameRef.current?.focus()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); e.stopPropagation(); submit() }
    if (e.key === 'Escape') { e.stopPropagation(); onClose() }
  }

  useEffect(() => {
    if (!isOpen) return
    const handler = (e) => {
      if (rowRef.current && !rowRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen, onClose])

  const inp = {
    border: '1px solid var(--border,#EAE3D8)',
    borderRadius: 8, padding: '6px 8px',
    fontSize: 13, outline: 'none',
    fontFamily: 'inherit', background: 'var(--surface,#fff)',
    color: 'var(--text-1,#2E2420)', transition: 'border-color .15s',
  }
  const focus = (e) => (e.target.style.borderColor = 'var(--accent,var(--accent))')
  const blur  = (e) => (e.target.style.borderColor = 'var(--border,#EAE3D8)')

  // ── Trigger button ───────────────────────────────────────────────────────────
  if (!isOpen) {
    return (
      <button
        onClick={onOpen}
        style={{
          display:'flex', alignItems:'center', gap:5,
          width:'100%', padding:'8px 13px',
          background:'none', border:'none', cursor:'pointer',
          fontSize:12, color:'var(--text-2,#7A6E66)',
          borderTop:'1px solid var(--border,#F2EDE6)',
          textAlign:'left', fontFamily:'inherit',
        }}
        onMouseEnter={e => { e.currentTarget.style.color='var(--accent,var(--accent))'; e.currentTarget.style.background='var(--accent-light,var(--accent-light))' }}
        onMouseLeave={e => { e.currentTarget.style.color='var(--text-2,#7A6E66)';  e.currentTarget.style.background='none' }}
      >
        <Plus size={12} weight="bold" />
        {t('tasks.quickAddBtn')}
      </button>
    )
  }

  // ── Expanded row — two lines ─────────────────────────────────────────────────
  return (
    <div ref={rowRef} style={{
      padding:'8px 10px 10px',
      background:'var(--accent-light,var(--accent-light))',
      borderTop:'1px solid var(--border,#EAE3D8)',
      display:'flex', flexDirection:'column', gap:6,
    }}>

      {/* Line 1: task name (full width) */}
      <input
        ref={nameRef}
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t('tasks.quickAddPlaceholder')}
        disabled={busy}
        style={{ ...inp, width:'100%', boxSizing:'border-box', padding:'7px 10px', fontSize:13 }}
        onFocus={focus} onBlur={blur}
      />

      {/* Line 2: qty · unit · price · total · ✓ · × */}
      <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'nowrap' }}>

        <input
          type="number"
          value={qty}
          onChange={e => setQty(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('tasks.qtyShort')}
          min="0"
          disabled={busy}
          style={{ ...inp, width:72, flexShrink:0 }}
          onFocus={focus} onBlur={blur}
        />

        <select
          value={unit}
          onChange={e => setUnit(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={busy}
          style={{ ...inp, flexShrink:0, cursor:'pointer', fontSize:12, padding:'6px 4px' }}
          onFocus={focus} onBlur={blur}
        >
          {UNIT_OPTIONS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
        </select>

        <input
          type="number"
          value={unitPrice}
          onChange={e => setUnitPrice(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`${t('tasks.priceShort')}/${unitLabel(unit, lang) || t('tasks.unitShort')}`}
          min="0"
          disabled={busy}
          style={{ ...inp, flex:1, minWidth:60 }}
          onFocus={focus} onBlur={blur}
        />

        {totalCost !== null && (
          <span style={{
            flexShrink:0, fontSize:11, fontWeight:700,
            color:'var(--accent,var(--accent))',
            background:'var(--surface,#fff)',
            border:'1px solid var(--accent,var(--accent))',
            borderRadius:7, padding:'3px 8px', whiteSpace:'nowrap',
          }}>
            = {totalCost.toLocaleString()} {currSym}
          </span>
        )}

        <button
          onClick={submit}
          disabled={busy || !name.trim()}
          title={`${t('common.add')} (Enter)`}
          style={{
            flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
            background: name.trim() && !busy ? 'var(--accent,var(--accent))' : '#D1C8C0',
            color:'#fff', border:'none', borderRadius:6,
            padding:'6px 10px',
            cursor: name.trim() && !busy ? 'pointer' : 'default',
            transition:'background .15s',
          }}
        >
          <Check size={14} weight="bold" />
        </button>

        <button
          onClick={onClose}
          title={`${t('common.cancel')} (Esc)`}
          style={{
            flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
            background:'transparent',
            border:'0.5px solid var(--border-med,#D1C8C0)',
            borderRadius:6, padding:'6px 10px',
            cursor:'pointer', color:'var(--text-2,#7A6E66)',
          }}
        >
          <X size={14} weight="bold" />
        </button>
      </div>
    </div>
  )
}
