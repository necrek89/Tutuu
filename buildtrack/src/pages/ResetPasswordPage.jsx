import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../i18n/useLanguage'
import LanguagePicker from '../components/LanguagePicker'
import { useAsyncGuard } from '../lib/useAsyncGuard'
import { AuthCard, Alert } from '../components/UI'

export default function ResetPasswordPage({ onDone }) {
  const { t } = useT()
  const [pw,      setPw]      = useState('')
  const [confirm, setConfirm] = useState('')
  const [error,   setError]   = useState('')
  const [saving,  guard]      = useAsyncGuard()
  const [success, setSuccess] = useState(false)

  const submit = () => guard(async () => {
    setError('')
    if (pw.length < 6)   { setError(t('auth.newPwTooShort'));  return }
    if (pw !== confirm)  { setError(t('auth.newPwMismatch'));  return }

    const { error } = await supabase.auth.updateUser({ password: pw })

    if (error) {
      setError(t('auth.newPwErrFailed'))
    } else {
      setSuccess(true)
      // sign out so user logs in fresh with new password
      setTimeout(async () => {
        await supabase.auth.signOut()
        onDone()
      }, 2200)
    }
  })

  return (
    <AuthCard>
        {/* Language picker */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <LanguagePicker />
        </div>

        {/* Logo + title */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--accent)', marginBottom: 6, letterSpacing: '-0.5px' }}>
            Tutuu
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#2E2420', marginBottom: 4 }}>
            {t('auth.newPwTitle')}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {t('auth.newPwDesc')}
          </div>
        </div>

        {/* Success state */}
        {success ? (
          <div style={{
            textAlign: 'center', padding: '24px 0',
          }}>
            <div style={{ width:48, height:48, borderRadius:'50%', background:'var(--success)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px', fontSize:22, fontWeight:700 }}>✓</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--success)', marginBottom: 6 }}>
              {t('auth.newPwSuccess')}
            </div>
          </div>
        ) : (
          <>
            {/* Error */}
            <Alert ok={false}>{error}</Alert>

            <form onSubmit={e => { e.preventDefault(); submit() }}>
            {/* New password */}
            <div className="form-group">
              <label className="form-label" htmlFor="auth-new-password">{t('auth.newPwLabel')}</label>
              <input
                id="auth-new-password" name="new-password"
                className="form-input" type="password"
                placeholder="••••••••"
                autoComplete="new-password"
                value={pw}
                onChange={e => setPw(e.target.value)}
                autoFocus
              />
            </div>

            {/* Confirm */}
            <div className="form-group">
              <label className="form-label" htmlFor="auth-confirm-password">{t('auth.newPwConfirm')}</label>
              <input
                id="auth-confirm-password" name="confirm-password"
                className="form-input" type="password"
                placeholder="••••••••"
                autoComplete="new-password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
              />
            </div>

            {/* Password strength bar */}
            {pw.length > 0 && (
              <div style={{ marginBottom: 14, marginTop: -4 }}>
                <div style={{ height: 3, background: '#EAE3D8', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    height: 3, borderRadius: 4, transition: 'width .3s, background .3s',
                    width: pw.length < 6 ? '25%' : pw.length < 10 ? '60%' : '100%',
                    background: pw.length < 6 ? '#E07B6A' : pw.length < 10 ? '#D4A843' : 'var(--success)',
                  }} />
                </div>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', padding: '11px 16px', fontSize: 14, borderRadius: 10 }}
              disabled={saving}
            >
              {saving ? t('auth.newPwSaving') : t('auth.newPwBtn')}
            </button>
            </form>
          </>
        )}
    </AuthCard>
  )
}
