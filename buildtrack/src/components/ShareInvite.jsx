import { useState } from 'react'
import { ShareNetwork, Copy } from '@phosphor-icons/react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/useLanguage'
import { Button } from './UI'
import { shareLink } from '../lib/share'
import { inviteLinkFor } from '../lib/joinLink'

// My invite code and a Share button: the link opens the app and asks to connect with me.
export default function ShareInvite() {
  const { t } = useT()
  const profile = useStore(s => s.profile)
  const [note, setNote] = useState('')
  const code = profile?.invite_code || ''
  const url = inviteLinkFor(code)
  const text = t(profile?.role === 'foreman' ? 'invite.shareTextForeman' : 'invite.shareTextWorker', { name: profile?.name || '' })

  const done = (res) => {
    if (res === 'copied') setNote(t('invite.copied'))
    else if (res === 'failed') setNote(t('invite.copyFailed'))
    else setNote('')
    if (res === 'copied' || res === 'failed') setTimeout(() => setNote(''), 2500)
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{
          flex: 1, fontFamily: 'monospace', fontSize: 15, fontWeight: 700, letterSpacing: '.04em',
          padding: '8px 12px', borderRadius: 8, background: 'var(--bg-subtle)',
          border: '0.5px solid var(--border-medium)', color: 'var(--text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{code || '—'}</div>
        <Button variant="primary" size="sm" onClick={async () => done(await shareLink({ title: 'Tutuu', text, url }))} disabled={!code}>
          <ShareNetwork size={14} weight="bold" style={{ marginRight: 4, verticalAlign: -2 }} />{t('invite.share')}
        </Button>
        <Button size="sm" onClick={async () => { try { await navigator.clipboard.writeText(url); done('copied') } catch { done('failed') } }} disabled={!code}>
          <Copy size={14} weight="bold" style={{ verticalAlign: -2 }} />
        </Button>
      </div>
      {note && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>{note}</div>}
    </div>
  )
}
