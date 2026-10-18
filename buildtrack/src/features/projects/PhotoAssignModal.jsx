import { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import { Images, Check, X, WarningCircle } from '@phosphor-icons/react'
import { Modal, Button } from '../../components/UI'
import { useT } from '../../i18n/useLanguage'
import { prepareImage } from '../../lib/imagePrep'
import { fileNumber, buildRefIndex } from '../../lib/photoRefs'

// Bulk "photos → tasks" screen. The user picks many photos at once (works the
// same on iPhone, iPad, Android, Windows, Mac), sees a thumbnail grid, and
// assigns selected photos to a task. File-name numbers matching a task's
// "IMG 8512-8514" text are pre-assigned as a convenience, never a requirement.
//
// Upload/attach are injected so this component knows nothing about Supabase:
//   uploadPhoto(file)           → public URL, or null on failure
//   attachPhotos(taskId, urls)  → { error }

const PREP_CONCURRENCY = 2
const UPLOAD_CONCURRENCY = 3

let nextId = 1

// Runs `worker` over `queue` with limited parallelism.
async function pool(queue, limit, worker) {
  const q = [...queue]
  await Promise.all(Array.from({ length: Math.min(limit, q.length) }, async () => {
    while (q.length) await worker(q.shift())
  }))
}

export default function PhotoAssignModal({ tasks, uploadPhoto, attachPhotos, onClose, onDone }) {
  const { t } = useT()
  const [items,    setItems]    = useState([])   // {id,name,size,num,status,file,thumb,taskIds[],auto}
  const [selected, setSelected] = useState(() => new Set())
  const [target,   setTarget]   = useState('')
  const [phase,    setPhase]    = useState('pick') // pick | uploading
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result,   setResult]   = useState(null) // {failed:number}
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef()
  const aliveRef = useRef(true)
  const itemsRef = useRef(items)
  itemsRef.current = items

  const refIndex = useMemo(() => buildRefIndex(tasks), [tasks])
  const taskById = useMemo(() => new Map(tasks.map(tk => [String(tk.id), tk])), [tasks])

  // Re-arm on every mount: StrictMode (dev) mounts, unmounts and remounts once,
  // and a cleanup-only flag would stay false and swallow every later update.
  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      itemsRef.current.forEach(it => it.thumb && URL.revokeObjectURL(it.thumb))
    }
  }, [])

  const patch = useCallback((id, changes) => {
    if (!aliveRef.current) return
    setItems(prev => prev.map(it => (it.id === id ? { ...it, ...changes } : it)))
  }, [])

  const addFiles = useCallback(async (fileList) => {
    const known = new Set(itemsRef.current.map(it => `${it.name}|${it.size}`))
    const fresh = Array.from(fileList || [])
      .filter(f => (/^image\//.test(f.type) || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name)) && !known.has(`${f.name}|${f.size}`))
      .map(f => {
        const num = fileNumber(f.name)
        const taskIds = num != null ? (refIndex.get(num) || []).map(String) : []
        return { id: nextId++, name: f.name, size: f.size, num, status: 'preparing', raw: f, file: null, thumb: null, taskIds, auto: taskIds.length > 0 }
      })
    if (!fresh.length) return
    setItems(prev => [...prev, ...fresh])
    await pool(fresh, PREP_CONCURRENCY, async (it) => {
      try {
        const { file, thumb } = await prepareImage(it.raw)
        patch(it.id, { status: 'ready', file, thumb: URL.createObjectURL(thumb), raw: null })
      } catch {
        patch(it.id, { status: 'error', raw: null })
      }
    })
  }, [refIndex, patch])

  const onPick = (e) => { addFiles(e.target.files); e.target.value = '' }

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const assign = () => {
    if (!target || !selected.size) return
    setItems(prev => prev.map(it => (selected.has(it.id) && !it.taskIds.includes(target)
      ? { ...it, taskIds: [...it.taskIds, target], auto: false } : it)))
    setSelected(new Set())
  }
  const unassignSelected = () => {
    setItems(prev => prev.map(it => (selected.has(it.id) ? { ...it, taskIds: [], auto: false } : it)))
    setSelected(new Set())
  }
  const unassignOne = (id, taskId) =>
    setItems(prev => prev.map(it => (it.id === id ? { ...it, taskIds: it.taskIds.filter(x => x !== taskId) } : it)))

  const selectUnassigned = () =>
    setSelected(new Set(items.filter(it => it.status !== 'error' && !it.taskIds.length).map(it => it.id)))

  // Per-task photo counts + the rows of the "assigned" list.
  const byTask = useMemo(() => {
    const m = new Map()
    items.forEach(it => it.taskIds.forEach(tid => {
      if (!m.has(tid)) m.set(tid, [])
      m.get(tid).push(it)
    }))
    return m
  }, [items])

  // Tasks grouped by stage for the <select> (native picker on every platform).
  const taskGroups = useMemo(() => {
    const groups = new Map()
    tasks.forEach(tk => {
      const key = tk.stage || ''
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(tk)
    })
    return [...groups.entries()]
  }, [tasks])

  const preparing  = items.filter(it => it.status === 'preparing').length
  const assigned   = items.filter(it => it.taskIds.length > 0)
  const autoCount  = items.filter(it => it.auto && it.taskIds.length).length
  const unassigned = items.filter(it => it.status !== 'error' && !it.taskIds.length).length
  const assignedPreparing = assigned.some(it => it.status === 'preparing')
  const uploadable = assigned.filter(it => it.status === 'ready')
  const taskCount  = byTask.size

  const startUpload = async () => {
    setPhase('uploading')
    setResult(null)
    setProgress({ done: 0, total: uploadable.length })
    const urlOf = new Map()
    await pool(uploadable, UPLOAD_CONCURRENCY, async (it) => {
      const url = await uploadPhoto(it.file)
      if (url) urlOf.set(it.id, url)
      if (aliveRef.current) setProgress(p => ({ ...p, done: p.done + 1 }))
    })
    // Attach per task, in the order photos were added. `left` tracks, per
    // photo, the tasks it still has to reach (everything, if its upload failed).
    const left = new Map(uploadable.map(it => [it.id, new Set(it.taskIds)]))
    for (const [taskId, its] of byTask) {
      const ready = its.filter(it => urlOf.has(it.id))
      if (!ready.length) continue
      const { error } = await attachPhotos(taskId, ready.map(it => urlOf.get(it.id)))
      if (!error) ready.forEach(it => left.get(it.id)?.delete(taskId))
    }
    if (!aliveRef.current) return
    uploadable.forEach(it => { if (urlOf.has(it.id) && left.get(it.id).size === 0) left.delete(it.id) })
    if (left.size === 0) {
      onDone?.()
      onClose()
      return
    }
    // Keep only photos that still have work to do, pointed at the tasks they missed.
    setItems(prev => {
      prev.filter(it => uploadable.includes(it) && !left.has(it.id)).forEach(it => it.thumb && URL.revokeObjectURL(it.thumb))
      return prev
        .filter(it => !uploadable.includes(it) || left.has(it.id))
        .map(it => (left.has(it.id) ? { ...it, taskIds: [...left.get(it.id)], auto: false } : it))
    })
    setResult({ failed: left.size })
    setPhase('pick')
    onDone?.()
  }

  const uploading = phase === 'uploading'
  const pad = { padding: '0 2px' }

  return (
    <Modal onClose={uploading ? () => {} : onClose} style={{ maxWidth: 760, maxHeight: '90dvh', display: 'flex', flexDirection: 'column' }}>
      <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Images size={20} weight="bold" /> {t('tasks.photoAssign.title')}
      </div>

      <input ref={inputRef} type="file" accept="image/*,.heic,.heif" multiple style={{ display: 'none' }} onChange={onPick} />

      <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
        {items.length === 0 ? (
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files) }}
            style={{
              border: `1.5px dashed ${dragOver ? 'var(--accent,#EA580C)' : 'var(--border-medium,#E8E4DC)'}`,
              borderRadius: 12, padding: '32px 16px', textAlign: 'center',
              background: dragOver ? 'var(--accent-light,#FFF7ED)' : 'transparent',
            }}
          >
            <div style={{ fontSize: 13, color: 'var(--text-secondary,#7A6E66)', marginBottom: 14, lineHeight: 1.5 }}>
              {t('tasks.photoAssign.intro')}
            </div>
            <Button variant="primary" onClick={() => inputRef.current?.click()}>{t('tasks.photoAssign.choose')}</Button>
            <div style={{ fontSize: 11, color: 'var(--text-muted,#A09690)', marginTop: 10 }}>{t('tasks.photoAssign.dropHint')}</div>
          </div>
        ) : (
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files) }}
            style={{ outline: dragOver ? '2px dashed var(--accent,#EA580C)' : 'none', outlineOffset: 2, borderRadius: 8 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary,#7A6E66)' }}>
                {t('tasks.photoAssign.summary', { n: items.length, a: assigned.length })}
                {preparing > 0 && ` · ${t('tasks.photoAssign.preparing', { n: preparing })}`}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {unassigned > 0 && !uploading && (
                  <Button size="sm" onClick={selectUnassigned}>{t('tasks.photoAssign.selectUnassigned')}</Button>
                )}
                {!uploading && <Button size="sm" onClick={() => inputRef.current?.click()}>{t('tasks.photoAssign.addMore')}</Button>}
              </div>
            </div>

            {autoCount > 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary,#7A6E66)', background: 'var(--bg-accent,#F2EDE4)', borderRadius: 8, padding: '7px 10px', marginBottom: 8 }}>
                {t('tasks.photoAssign.autoNote', { n: autoCount })}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 6 }}>
              {items.map(it => {
                const isSel = selected.has(it.id)
                return (
                  <button
                    key={it.id}
                    type="button"
                    aria-pressed={isSel}
                    disabled={it.status === 'error' || uploading}
                    onClick={() => toggle(it.id)}
                    title={it.name}
                    style={{
                      position: 'relative', aspectRatio: '1 / 1', padding: 0, overflow: 'hidden',
                      borderRadius: 8, cursor: it.status === 'error' ? 'default' : 'pointer',
                      border: isSel ? '3px solid var(--accent,#EA580C)' : '0.5px solid var(--border-medium,#E8E4DC)',
                      background: 'var(--bg-accent,#F2EDE4)',
                    }}
                  >
                    {it.thumb && <img src={it.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                    {it.status === 'preparing' && (
                      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--text-muted,#A09690)' }}>...</span>
                    )}
                    {it.status === 'error' && (
                      <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 10, color: '#B91C1C', padding: 4 }}>
                        <WarningCircle size={18} weight="bold" />
                        {t('tasks.photoAssign.unreadable')}
                      </span>
                    )}
                    {it.taskIds.length > 0 && (
                      <span style={{ position: 'absolute', left: 4, bottom: 4, background: 'var(--accent,#EA580C)', color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 6px', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <Check size={10} weight="bold" />{it.taskIds.length}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {byTask.size > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#7A6E66', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                  {t('tasks.photoAssign.assignedHeader')}
                </div>
                {[...byTask.entries()].map(([taskId, its]) => (
                  <div key={taskId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderTop: '0.5px solid var(--border,#EAE3D8)' }}>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {taskById.get(taskId)?.text || taskId}
                    </div>
                    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '55%' }}>
                      {its.map(it => (
                        <span key={it.id} style={{ position: 'relative', width: 30, height: 30, borderRadius: 5, overflow: 'hidden', background: 'var(--bg-accent,#F2EDE4)', flexShrink: 0 }}>
                          {it.thumb && <img src={it.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                          {!uploading && (
                            <button type="button" aria-label={t('tasks.photoAssign.unassign')} onClick={() => unassignOne(it.id, taskId)}
                              style={{ position: 'absolute', top: 0, right: 0, width: 14, height: 14, padding: 0, border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <X size={9} weight="bold" />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {selected.size > 0 && !uploading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: '10px 0 0', borderTop: '1px solid #EAE3D8', marginTop: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, ...pad }}>{t('tasks.photoAssign.selectedN', { n: selected.size })}</span>
          <select
            className="form-input"
            value={target}
            onChange={e => setTarget(e.target.value)}
            style={{ flex: '1 1 180px', minWidth: 0, fontSize: 13 }}
          >
            <option value="">{t('tasks.photoAssign.pickTask')}</option>
            {taskGroups.map(([stage, list]) => (
              <optgroup key={stage || '_'} label={stage || t('tasks.photoAssign.noStage')}>
                {list.map(tk => (
                  <option key={tk.id} value={String(tk.id)}>
                    {tk.text}{byTask.get(String(tk.id)) ? ` (${byTask.get(String(tk.id)).length})` : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <Button variant="primary" size="sm" disabled={!target} onClick={assign}>{t('tasks.photoAssign.assign')}</Button>
          <Button size="sm" onClick={unassignSelected}>{t('tasks.photoAssign.unassign')}</Button>
        </div>
      )}

      {result && (
        <div style={{ fontSize: 12, color: '#B91C1C', marginTop: 8 }}>{t('tasks.photoAssign.failed', { n: result.failed })}</div>
      )}
      {!result && unassigned > 0 && items.length > 0 && !uploading && (
        <div style={{ fontSize: 11, color: 'var(--text-muted,#A09690)', marginTop: 8 }}>{t('tasks.photoAssign.notAssigned', { n: unassigned })}</div>
      )}

      <div className="modal-actions" style={{ paddingTop: 12, borderTop: '1px solid #EAE3D8', marginTop: 8 }}>
        <Button size="sm" disabled={uploading} onClick={onClose}>{t('tasks.photoAssign.cancel')}</Button>
        <Button
          variant="primary"
          size="sm"
          disabled={uploading || assignedPreparing || uploadable.length === 0}
          onClick={startUpload}
        >
          {uploading
            ? t('tasks.photoAssign.uploading', { done: progress.done, total: progress.total })
            : t('tasks.photoAssign.upload', { n: uploadable.length, tasks: taskCount })}
        </Button>
      </div>
    </Modal>
  )
}
