import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/useLanguage'
import { Modal, Button, Alert } from './UI'

// Opened after someone taps an invitation link (?join=CODE): shows who it is and offers one button.
export default function JoinInviteModal({ code, onClose }) {
  const { t } = useT()
  const { profile, lookupProfileByCode, sendJoinRequest, inviteWorker } = useStore()
  const [target, setTarget] = useState(undefined) // undefined = loading, null = not found
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null) // { ok, text }

  useEffect(() => {
    if (!code) return
    lookupProfileByCode(code).then(setTarget).catch(() => setTarget(null))
  }, [code])

  const close = onClose

  const me = profile?.role
  const same = target && target.role === me
  const self = target && target.id === profile?.id
  const canAct = target && !self && ((me === 'worker' && target.role === 'foreman') || (me === 'foreman' && target.role === 'worker'))

  const act = async () => {
    setBusy(true)
    const res = me === 'worker' ? await sendJoinRequest(code) : await inviteWorker(target)
    setBusy(false)
    if (res?.error) setResult({ ok: false, text: typeof res.error === 'string' ? res.error : t('invite.failed') })
    else setResult({ ok: true, text: t(me === 'worker' ? 'invite.requestSent' : 'invite.inviteSent', { name: target.name }) })
  }

  return (
    <Modal onClose={close}>
      <div className="modal-title">{t('invite.linkTitle')}</div>
      {target === undefined && <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>…</div>}
      {target === null && <Alert ok={false}>{t('invite.linkNotFound')}</Alert>}
      {target && !result && (
        <>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{target.name}</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
            {self ? t('invite.ownLink')
              : same ? t('invite.sameRole')
              : t(me === 'worker' ? 'invite.askJoinCrew' : 'invite.askInvite', { name: target.name })}
          </div>
        </>
      )}
      {result && <Alert ok={result.ok}>{result.text}</Alert>}
      <div className="modal-actions">
        <Button size="sm" onClick={close}>{t(result ? 'invite.done' : 'invite.later')}</Button>
        {canAct && !result && (
          <Button variant="primary" size="sm" onClick={act} disabled={busy}>
            {busy ? '...' : t(me === 'worker' ? 'invite.sendRequest' : 'invite.sendInvite')}
          </Button>
        )}
      </div>
    </Modal>
  )
}
