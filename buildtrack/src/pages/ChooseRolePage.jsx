import { useState } from 'react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/useLanguage'
import { supabase } from '../lib/supabase'
import { AuthCard, Alert } from '../components/UI'

// Shown once after a first Google/Apple sign-in, when the account has no
// profile role yet (email sign-up collects it on the form instead).
export default function ChooseRolePage({ onDone }) {
  const { t } = useT()
  const { user, checkSession } = useStore()
  const [name, setName] = useState(user?.user_metadata?.full_name || user?.user_metadata?.name || '')
  const [role, setRole] = useState('worker')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim()) { setError(t('auth.errFillName')); return }
    setSaving(true); setError('')
    // The handle_new_user trigger has already created the profile (as 'worker'),
    // so this is an UPDATE. (An upsert would fail: email is NOT NULL and Postgres
    // checks the proposed insert row before it resolves the conflict.)
    const patch = { name: name.trim(), role }
    if (role === 'foreman') patch.invite_code = Math.random().toString(36).substring(2, 10)
    let { data: rows, error: err } = await supabase.from('profiles').update(patch).eq('id', user.id).select('id')
    if (!err && (!rows || rows.length === 0)) {
      // no profile yet (trigger missing/slow): create it
      ;({ error: err } = await supabase.from('profiles').insert({ id: user.id, email: user.email, ...patch }))
    }
    if (err) { setSaving(false); setError(t('auth.oauthError')); return }
    // Record the choice in auth metadata so checkSession stops asking.
    await supabase.auth.updateUser({ data: { name: name.trim(), role } })
    await checkSession()
    setSaving(false)
    onDone()
  }

  return (
    <AuthCard>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--accent)', marginBottom: 6, letterSpacing: '-0.5px' }}>Tutuu</div>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{t('auth.chooseRoleTitle')}</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('auth.chooseRoleDesc')}</div>
      </div>
      <Alert ok={false}>{error}</Alert>
      <div className="form-group">
        <label className="form-label">{t('auth.nameLabel')}</label>
        <input className="form-input" placeholder={t('auth.namePlaceholder')} value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label">{t('auth.roleLabel')}</label>
        <select className="form-input" value={role} onChange={e => setRole(e.target.value)}>
          <option value="foreman">{t('roles.foreman')}</option>
          <option value="worker">{t('roles.worker')}</option>
        </select>
      </div>
      <button className="btn btn-primary" disabled={saving}
        style={{ width: '100%', marginTop: 8, padding: '11px 16px', fontSize: 14, borderRadius: 10 }} onClick={save}>
        {saving ? t('auth.loadingBtn') : t('auth.continueBtn')}
      </button>
    </AuthCard>
  )
}
