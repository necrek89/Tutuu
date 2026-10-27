import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/useLanguage'
import { Button, Alert } from './UI'

// Incoming crew requests waiting for my answer:
//   worker  -> invitations from foremen: accept / decline
//   foreman -> requests from workers: approve / decline
export default function JoinInbox() {
  const { t } = useT()
  const { role, invitations, joinRequests, fetchInvitations, fetchJoinRequests, respondInvitation, approveJoinRequest, rejectJoinRequest } = useStore()
  const [err, setErr] = useState('')

  useEffect(() => {
    if (role === 'worker') fetchInvitations()
    if (role === 'foreman') fetchJoinRequests()
  }, [role])

  const items = role === 'worker'
    ? invitations.map(r => ({ id: r.id, who: r.foreman?.name || '—', sub: r.foreman?.company, text: t('invite.invitedYou') }))
    : role === 'foreman'
      ? joinRequests.map(r => ({ id: r.id, who: r.worker?.name || '—', sub: r.worker?.email, text: t('invite.wantsToJoin'), workerId: r.worker?.id }))
      : []
  if (!items.length) return null

  const answer = async (it, accept) => {
    setErr('')
    let res
    if (role === 'worker') res = await respondInvitation(it.id, accept)
    else res = accept ? await approveJoinRequest(it.id, it.workerId) : await rejectJoinRequest(it.id)
    if (res?.error) setErr(typeof res.error === 'string' ? res.error : t('invite.failed'))
  }

  return (
    <div className="card card-body" style={{ marginBottom: 12, border: '1px solid var(--accent-border)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>
        {t(role === 'worker' ? 'invite.inboxWorker' : 'invite.inboxForeman')}
      </div>
      <Alert ok={false} dense>{err}</Alert>
      {items.map(it => (
        <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '0.5px solid var(--border-medium)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{it.who}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{it.text}{it.sub ? ` · ${it.sub}` : ''}</div>
          </div>
          <Button variant="primary" size="sm" onClick={() => answer(it, true)}>{t(role === 'worker' ? 'invite.accept' : 'invite.approve')}</Button>
          <Button size="sm" onClick={() => answer(it, false)}>{t('invite.decline')}</Button>
        </div>
      ))}
    </div>
  )
}
