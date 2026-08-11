import { useState, useEffect, useRef } from 'react'
import { Hourglass, X, Warning, CaretDown, CaretUp } from '@phosphor-icons/react'
import { useStore, currencySymbol } from '../store/useStore'
import { useT } from '../i18n/useLanguage'
import translations from '../i18n/translations'
import { normalizeUnit, unitLabel } from '../i18n/units'
import { Button, FormGroup, Modal } from './UI'
import { supabase } from '../lib/supabase'
import DatePicker from './DatePicker'

// ── Creatable combobox for stage/zone: pick an existing name or type a new
// one and create it on the fly (adds it to the project's list + assigns it
// to this task in one action). Falls back to a plain "start typing" empty
// state when the project has no stages/zones yet, instead of a dead-end list.
function GroupCombobox({ value, options, onChange, onCreate, placeholder, emptyPlaceholder, emptyHint, clearLabel, createLabel }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value || '')
  const wrapRef = useRef()

  useEffect(() => { setQuery(value || '') }, [value])

  useEffect(() => {
    if (!open) return
    const onDocClick = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const q            = query.trim().toLowerCase()
  const filteredOpts  = q ? options.filter(o => o.toLowerCase().includes(q)) : options
  const exactMatch    = options.some(o => o.toLowerCase() === q)
  const showCreate    = q.length > 0 && !exactMatch

  const selectValue = (v) => { onChange(v); setQuery(v); setOpen(false) }
  const createValue = async () => {
    const name = query.trim()
    if (!name) return
    await onCreate(name)
    setQuery(name)
    setOpen(false)
  }

  const itemStyle = {
    display:'block', width:'100%', textAlign:'left', padding:'8px 12px',
    background:'none', border:'none', cursor:'pointer', fontSize:13,
    color:'var(--text-primary,#2E2420)',
  }

  return (
    <div ref={wrapRef} style={{ position:'relative' }}>
      <input
        className="form-input"
        value={query}
        placeholder={options.length === 0 ? emptyPlaceholder : placeholder}
        onFocus={() => setOpen(true)}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); showCreate ? createValue() : (filteredOpts[0] != null && selectValue(filteredOpts[0])) }
          if (e.key === 'Escape') { setOpen(false); setQuery(value || '') }
        }}
      />
      {options.length === 0 && !open && (
        <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>{emptyHint}</div>
      )}
      {open && (
        <div style={{
          position:'absolute', top:'calc(100% + 4px)', left:0, right:0, zIndex:60,
          background:'var(--bg,#fff)', border:'0.5px solid var(--border-medium,#E8E4DC)',
          borderRadius:10, boxShadow:'0 4px 20px rgba(0,0,0,0.10)', maxHeight:220, overflowY:'auto',
        }}>
          {showCreate && (
            <button type="button" onClick={createValue} style={{ ...itemStyle, fontWeight:600, color:'var(--accent,#EA580C)', borderBottom: (value || filteredOpts.length > 0) ? '0.5px solid var(--border,#EAE3D8)' : 'none' }}>
              {createLabel(query.trim())}
            </button>
          )}
          {value && (
            <button type="button" onClick={() => selectValue('')} style={{ ...itemStyle, color:'var(--text-muted)', fontStyle:'italic', borderBottom: filteredOpts.length > 0 ? '0.5px solid var(--border,#EAE3D8)' : 'none' }}>
              {clearLabel}
            </button>
          )}
          {filteredOpts.map((o, i) => (
            <button type="button" key={o} onClick={() => selectValue(o)} style={{ ...itemStyle, borderBottom: i < filteredOpts.length - 1 ? '0.5px solid var(--border,#EAE3D8)' : 'none' }}>
              {o}
            </button>
          ))}
          {!showCreate && !value && filteredOpts.length === 0 && (
            <div style={{ padding:'8px 12px', fontSize:12, color:'var(--text-muted)' }}>—</div>
          )}
        </div>
      )}
    </div>
  )
}

// No default stages — each project defines its own.
// Unit list lives in translations (tasks.units) — the stored short code is
// locale-appropriate free text, printed as-is on invoices and exports.

// ── Image compression (canvas) ───────────────────────────────────────────────
async function compressImage(file, maxPx = 1400, quality = 0.82) {
  // Only compress images, pass videos through unchanged
  if (!file.type.startsWith('image/')) return file
  return new Promise((resolve) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const { naturalWidth: w, naturalHeight: h } = img
      // If already small enough, skip compression
      if (w <= maxPx && h <= maxPx) { resolve(file); return }
      const scale  = maxPx / Math.max(w, h)
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(w * scale)
      canvas.height = Math.round(h * scale)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        blob => resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })),
        'image/jpeg',
        quality,
      )
    }
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file) }
    img.src = objectUrl
  })
}

export default function TaskModal({ task, onClose, defaultProjectId }) {
  const { t, lang } = useT()
  // Option values are the canonical English unit code (stored in the DB so
  // it displays correctly regardless of which language created/views it);
  // labels are localized for whoever's picking right now.
  const LOCAL_UNITS = translations[lang]?.tasks?.units || translations.en.tasks.units
  const UNIT_OPTIONS = translations.en.tasks.units.map((u, i) => ({ value: u.value, label: LOCAL_UNITS[i]?.label || u.label }))
  const { addTask, updateTask, fetchTasks, projects, fetchProjects, fetchWorkers, profile, updateProject } = useStore()
  const isEdit = !!task
  const [workers,   setWorkers]   = useState([])
  const [uploading, setUploading] = useState(false)
  const [mediaUrls, setMediaUrls] = useState(
    task?.photo_url ? task.photo_url.split(',').filter(Boolean) : []
  )
  const fileRef = useRef()

  const [form, setForm] = useState({
    text:        task?.text        || '',
    description: task?.description || '',
    project_id:  task?.project_id  || defaultProjectId || projects[0]?.id || '',
    worker_id:   task?.worker_id   || '',
    stage:       task?.stage       || '',
    zone:        task?.zone        || '',
    start_date:  task?.start_date  || '',
    deadline:    task?.deadline    || '',
    quantity:    task?.quantity    || '',
    unit:        normalizeUnit(task?.unit) || '',
    cost:        task?.cost        || '',
    currency:    task?.currency    || useStore.getState().profile?.currency || 'USD',
  })

  // Unit price helper (not saved to DB — cost = quantity × unitPrice)
  const [unitPrice, setUnitPrice] = useState(() => {
    if (task?.cost && task?.quantity && parseFloat(task.quantity) > 0) {
      return String(Math.round((parseFloat(task.cost) / parseFloat(task.quantity)) * 100) / 100)
    }
    return ''
  })

  const currSym = currencySymbol(useStore.getState().profile?.currency)

  // "More details" starts collapsed for a brand-new task (only Title is
  // required) and starts open when editing a task that already has any of
  // this data, so the user isn't forced to tap just to see what's there.
  const [expanded, setExpanded] = useState(() =>
    isEdit && !!(task.stage || task.zone || task.worker_id || task.start_date || task.deadline || task.quantity || task.unit || task.cost)
  )

  const currentProj = projects.find(p => p.id === form.project_id)
  const stageList = Array.isArray(currentProj?.stages) ? currentProj.stages : []
  const zoneList  = Array.isArray(currentProj?.zones)  ? currentProj.zones  : []

  const createStage = async (name) => {
    await updateProject(form.project_id, { stages: [...stageList, name] })
    setForm(f => ({ ...f, stage: name }))
  }
  const createZone = async (name) => {
    await updateProject(form.project_id, { zones: [...zoneList, name] })
    setForm(f => ({ ...f, zone: name }))
  }

  const handleUnitPriceChange = (val) => {
    setUnitPrice(val)
    const qty = parseFloat(form.quantity)
    const price = parseFloat(val)
    if (!isNaN(qty) && qty > 0 && !isNaN(price) && price > 0) {
      setForm(f => ({ ...f, cost: String(Math.round(qty * price * 100) / 100) }))
    }
  }

  const handleQuantityChange = (val) => {
    const qty = parseFloat(val)
    const price = parseFloat(unitPrice)
    const hasPrice = !isNaN(qty) && qty > 0 && !isNaN(price) && price > 0
    setForm(f => ({ ...f, quantity: val, cost: hasPrice ? String(Math.round(qty * price * 100) / 100) : f.cost }))
  }

  useEffect(() => {
    const load = async () => {
      let projs = projects
      if (projs.length === 0) {
        await fetchProjects()
        projs = useStore.getState().projects
      }
      if (!form.project_id && projs[0]) {
        setForm(f => ({ ...f, project_id: projs[0].id }))
      }
      const projectId = form.project_id || projs[0]?.id
      if (projectId) {
        const w = await fetchWorkers(projectId)
        setWorkers(w)
      }
    }
    load()
  }, [])

  const set = (field) => async (e) => {
    const val = e.target.value
    setForm(f => ({ ...f, [field]: val }))
    if (field === 'project_id' && val) {
      const w = await fetchWorkers(val)
      setWorkers(w)
      const proj = useStore.getState().projects.find(p => p.id === val)
      const firstStage = Array.isArray(proj?.stages) && proj.stages.length > 0 ? proj.stages[0] : ''
      const firstZone  = Array.isArray(proj?.zones)  && proj.zones.length  > 0 ? proj.zones[0]  : ''
      setForm(f => ({ ...f, project_id: val, worker_id: '', stage: firstStage, zone: firstZone }))
    }
  }

  const uploadMedia = async (files) => {
    if (!files?.length) return
    setUploading(true)
    const newUrls = []
    for (const rawFile of Array.from(files)) {
      // Compress images before upload
      const file = await compressImage(rawFile)
      const ext  = file.name.split('.').pop()
      const path = `${profile?.id || 'anon'}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('task-photos').upload(path, file, { upsert: true })
      if (!error) {
        const { data } = supabase.storage.from('task-photos').getPublicUrl(path)
        newUrls.push(data.publicUrl)
      }
    }
    setMediaUrls(prev => [...prev, ...newUrls])
    setUploading(false)
  }

  const removeMedia = (url) => setMediaUrls(prev => prev.filter(u => u !== url))

  const [saveError, setSaveError] = useState(null)
  const [saving,    setSaving]    = useState(false)

  const save = async () => {
    if (!form.text.trim()) return
    setSaving(true)
    setSaveError(null)
    const payload = {
      ...form,
      worker_id:  form.worker_id  || null,
      start_date: form.start_date || null,
      deadline:   form.deadline   || null,
      photo_url: mediaUrls.join(',') || null,
      quantity:  form.quantity ? parseFloat(form.quantity) : null,
      unit:      form.unit || null,
      cost:      form.cost ? parseFloat(form.cost) : null,
      currency:  form.currency || '$',
    }
    let error
    if (isEdit) {
      ;({ error } = await updateTask(task.id, payload))
    } else {
      ;({ error } = await addTask({ ...payload, status: 'new' }))
    }
    setSaving(false)
    if (error) {
      setSaveError(error.message || t('tasks.saveError'))
      return
    }
    // Refresh tasks to get full data with joins (worker name etc.)
    if (form.project_id) await fetchTasks(form.project_id)
    onClose()
  }

  const isVideo = (url) => /\.(mp4|mov|webm|avi|mkv)$/i.test(url)

  return (
    <Modal onClose={onClose} style={{ maxHeight:'90dvh', display:'flex', flexDirection:'column' }}>
        <div className="modal-title">{isEdit ? t('tasks.editTitle') : t('tasks.newTitle')}</div>

        <div style={{ overflowY:'auto', flex:1, paddingRight:2 }}>

          {/* ── Project: fixed context (disabled) when opened from a project's
               own Tasks tab — the only way this modal is opened today. Only
               falls back to an editable select, tucked into "More details",
               when the modal is ever opened without a project context. ── */}
          {defaultProjectId && (
            <FormGroup label={t('tasks.projectLabel')}>
              <input className="form-input" value={currentProj?.name || ''} disabled style={{ opacity:0.65, cursor:'not-allowed' }} />
            </FormGroup>
          )}

          {/* ── The only required, focused field: Title. Save is reachable
               right below it (pinned modal footer) without touching anything else. ── */}
          <FormGroup label={`${t('tasks.titleLabel')} *`}>
            <input
              className="form-input"
              placeholder={t('tasks.titlePlaceholder')}
              value={form.text}
              onChange={set('text')}
              autoFocus
            />
          </FormGroup>

          <FormGroup label={t('tasks.detailsLabel')}>
            <textarea
              className="form-input"
              rows={3}
              placeholder={t('tasks.detailsPlaceholder')}
              value={form.description}
              onChange={set('description')}
              style={{ resize:'vertical', minHeight:64 }}
            />
          </FormGroup>

          {/* ── Everything else lives behind "More details" — stage/zone,
               assignee/deadline, cost & volume (and project, only when the
               modal has no fixed project context) ── */}
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            style={{
              display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%',
              background:'var(--bg-accent,#F2EDE4)', border:'none', borderRadius:10,
              padding:'10px 12px', cursor:'pointer', marginTop:14, marginBottom: expanded ? 12 : 4,
            }}
          >
            <span style={{ fontSize:12, fontWeight:600, color:'var(--text-secondary)' }}>{t('tasks.moreDetails')}</span>
            <span style={{ color:'var(--text-muted)', display:'flex', alignItems:'center' }}>
              {expanded ? <CaretUp size={13} weight="bold" /> : <CaretDown size={13} weight="bold" />}
            </span>
          </button>
          {!expanded && (
            <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:10 }}>{t('tasks.moreDetailsHint')}</div>
          )}

          {expanded && (
            <>
              {!defaultProjectId && (
                <FormGroup label={`${t('tasks.projectLabel')} *`}>
                  <select className="form-input" value={form.project_id} onChange={set('project_id')}>
                    <option value="">—</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </FormGroup>
              )}

              <div className="form-grid-2">
                <FormGroup label={t('tasks.stageLabel')}>
                  <GroupCombobox
                    value={form.stage}
                    options={stageList}
                    onChange={v => setForm(f => ({ ...f, stage: v }))}
                    onCreate={createStage}
                    placeholder={t('tasks.stageNamePlaceholder')}
                    emptyPlaceholder={t('tasks.noStagesYetPlaceholder')}
                    emptyHint={t('tasks.noStagesHint')}
                    clearLabel={t('tasks.noStage')}
                    createLabel={name => t('tasks.createStagePrompt', { name })}
                  />
                </FormGroup>
                <FormGroup label={t('tasks.zoneLabel')}>
                  <GroupCombobox
                    value={form.zone}
                    options={zoneList}
                    onChange={v => setForm(f => ({ ...f, zone: v }))}
                    onCreate={createZone}
                    placeholder={t('tasks.zoneNamePlaceholder')}
                    emptyPlaceholder={t('tasks.noZonesYetPlaceholder')}
                    emptyHint={t('tasks.noZonesHint')}
                    clearLabel={t('tasks.noZone')}
                    createLabel={name => t('tasks.createZonePrompt', { name })}
                  />
                </FormGroup>
              </div>

              {/* ── When: start + deadline (deadline doubles as the end date
                   for the crew Schedule view) ── */}
              <div className="form-grid-2">
                <FormGroup label={t('tasks.startDateLabel')}>
                  <DatePicker value={form.start_date} onChange={v => setForm(f => ({ ...f, start_date: v }))} />
                </FormGroup>
                <FormGroup label={t('tasks.deadlineLabel')}>
                  <DatePicker value={form.deadline} onChange={v => setForm(f => ({ ...f, deadline: v }))} />
                </FormGroup>
              </div>

              {/* ── Who: assignee ── */}
              <FormGroup label={t('tasks.assigneeLabel')}>
                <select className="form-input" value={form.worker_id} onChange={set('worker_id')}>
                  <option value="">{t('tasks.unassigned')}</option>
                  {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </FormGroup>

              {/* ── Cost & volume — one contiguous block ── */}
              <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'.08em',
                color:'var(--accent)', borderBottom:'1.5px solid var(--accent-border)',
                paddingBottom:6, marginBottom:12, marginTop:16 }}>
                {t('tasks.costSection')}
              </div>

              <div className="form-grid-2">
                <FormGroup label={t('tasks.qtyLabel')}>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    step="any"
                    placeholder={t('tasks.qtyPlaceholder')}
                    value={form.quantity}
                    onChange={e => handleQuantityChange(e.target.value)}
                  />
                </FormGroup>
                <FormGroup label={t('tasks.unitLabel')}>
                  <select className="form-input" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                    {UNIT_OPTIONS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                  </select>
                </FormGroup>
              </div>

              {/* Unit price → auto-calc total */}
              <FormGroup label={`${t('tasks.unitPriceLabel')}${form.unit ? ` (${unitLabel(form.unit, lang)})` : ''}`}>
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    step="any"
                    placeholder={t('tasks.pricePlaceholder')}
                    value={unitPrice}
                    onChange={e => handleUnitPriceChange(e.target.value)}
                    style={{ flex:1, minWidth:0 }}
                  />
                  <span style={{ fontSize:13, color:'var(--text-secondary)', flexShrink:0 }}>{currSym}</span>
                  {unitPrice && form.quantity && parseFloat(unitPrice) > 0 && parseFloat(form.quantity) > 0 && (
                    <div style={{
                      display:'flex', alignItems:'center', gap:4, flexShrink:0,
                      fontSize:12, color:'var(--text-muted)', background:'var(--bg-accent,#F2EDE4)',
                      borderRadius:6, padding:'4px 8px',
                    }}>
                      <span style={{ color:'var(--text-muted)' }}>{form.quantity} × {unitPrice} =</span>
                      <span style={{ fontWeight:700, color:'var(--accent,var(--accent))' }}>
                        {(parseFloat(form.quantity) * parseFloat(unitPrice)).toLocaleString()} {currSym}
                      </span>
                    </div>
                  )}
                </div>
              </FormGroup>

              <FormGroup label={t('tasks.totalLabel')}>
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    step="any"
                    placeholder={t('tasks.totalPlaceholder')}
                    value={form.cost}
                    onChange={e => {
                      setForm(f => ({ ...f, cost: e.target.value }))
                      // Manual override — clear unitPrice to avoid confusion
                      setUnitPrice('')
                    }}
                    style={{ flex:1, minWidth:0 }}
                  />
                  <span style={{ fontSize:13, color:'var(--text-secondary)', flexShrink:0 }}>{currSym}</span>
                </div>
                <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:4 }}>
                  {t('tasks.totalHint')}
                </div>
              </FormGroup>
            </>
          )}

          {/* ── Media attachments ── */}
          <FormGroup label={t('tasks.mediaLabel')}>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              multiple
              style={{ display:'none' }}
              onChange={e => uploadMedia(e.target.files)}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              style={{
                width:'100%', padding:'10px', borderRadius:10,
                border:'1.5px dashed #D9D0C7', background:'var(--surface-2,#FDFBF8)',
                cursor:'pointer', fontSize:13, color:'#7A6E66',
                display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              }}
            >
              {uploading ? <><Hourglass size={13} weight="bold" /> {t('common.uploading')}</> : t('tasks.attachBtn')}
            </button>

            {mediaUrls.length > 0 && (
              <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:10 }}>
                {mediaUrls.map((url, i) => (
                  <div key={i} style={{ position:'relative' }}>
                    {isVideo(url) ? (
                      <video
                        src={url}
                        style={{ width:80, height:80, objectFit:'cover', borderRadius:8, border:'1px solid #EAE3D8', background:'#000' }}
                        controls={false}
                        muted
                      />
                    ) : (
                      <img
                        src={url}
                        alt=""
                        style={{ width:80, height:80, objectFit:'cover', borderRadius:8, border:'1px solid #EAE3D8' }}
                      />
                    )}
                    <button
                      onClick={() => removeMedia(url)}
                      style={{
                        position:'absolute', top:-6, right:-6,
                        width:20, height:20, borderRadius:'50%',
                        background:'var(--danger)', color:'#fff',
                        border:'none', fontSize:11, cursor:'pointer',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        lineHeight:1,
                      }}
                    ><X size={11} weight="bold" /></button>
                    {isVideo(url) && (
                      <div style={{
                        position:'absolute', inset:0, display:'flex',
                        alignItems:'center', justifyContent:'center',
                        background:'rgba(0,0,0,0.3)', borderRadius:8, pointerEvents:'none',
                      }}>
                        <span style={{ fontSize:22 }}>▶</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </FormGroup>

        </div>

        {saveError && (
          <div style={{ margin:'8px 0 0', padding:'8px 12px', background:'var(--danger-bg)', color:'var(--danger)', borderRadius:8, fontSize:12 }}>
            <Warning size={13} weight="bold" /> {saveError}
          </div>
        )}
        <div className="modal-actions" style={{ paddingTop:12, borderTop:'1px solid #EAE3D8', marginTop:4 }}>
          <Button size="sm" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" size="sm" onClick={save} disabled={saving}>
            {saving ? '...' : isEdit ? t('common.save') : t('tasks.addBtn')}
          </Button>
        </div>
    </Modal>
  )
}
