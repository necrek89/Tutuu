import { useState } from 'react'
import { useStore } from '../store/useStore'
import { useT } from '../i18n/useLanguage'
import LanguagePicker from '../components/LanguagePicker'
import { supabase } from '../lib/supabase'
import { useAsyncGuard } from '../lib/useAsyncGuard'
import { AuthCard, Alert } from '../components/UI'
import { GoogleLogo, AppleLogo } from '@phosphor-icons/react'
import { signInWithProvider, APPLE_SIGNIN_ENABLED } from '../lib/oauth'

export default function LoginPage({ onLogin }) {
  const { signIn, signUp, loading } = useStore()
  const { t } = useT()
  // mode: 'login' | 'register' | 'forgot'
  const [mode,    setMode]    = useState('login')
  const [form,    setForm]    = useState({ email: '', password: '', name: '', role: 'worker' })
  const [resetEmail, setResetEmail] = useState('')
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState('')
  const [sending, guardReset] = useAsyncGuard()

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }))

  const switchMode = (m) => { setMode(m); setError(''); setSuccess('') }

  // ── Login / Register ────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (loading) return
    setError(''); setSuccess('')
    if (!form.email || !form.password) { setError(t('auth.errFillAll')); return }
    if (mode === 'login') {
      const { error } = await signIn(form.email, form.password)
      if (error) { setError(t('auth.errCredentials')); return }
      onLogin()
    } else {
      if (!form.name) { setError(t('auth.errFillName')); return }
      const { error } = await signUp(form.email, form.password, form.name, form.role)
      if (error) { setError(t('auth.errSignupFailed')); return }
      localStorage.removeItem('tutuu_onboarded')
      setSuccess(t('auth.successCreated'))
      switchMode('login')
    }
  }

  const handleProvider = async (provider) => {
    setError(''); setSuccess('')
    const { error } = await signInWithProvider(provider)
    if (error) setError(t('auth.oauthError'))
  }

  // ── Forgot password ─────────────────────────────────────────────────────────
  const handleReset = () => guardReset(async () => {
    setError(''); setSuccess('')
    if (!resetEmail.trim()) { setError(t('auth.resetErrNoEmail')); return }
    const { error } = await supabase.auth.resetPasswordForEmail(
      resetEmail.trim(),
      { redirectTo: window.location.origin }
    )
    if (error) { setError(t('auth.resetErrFailed')); return }
    setSuccess(t('auth.resetSent', { email: resetEmail.trim() }))
  })

  return (
    <AuthCard>
        {/* Top row: onboarding + language picker */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <button
            onClick={() => { localStorage.removeItem('tutuu_onboarded'); window.location.reload() }}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: '#FAF7F2', border: '1px solid #EAE3D8',
              borderRadius: 20, padding: '5px 12px',
              fontSize: 12, color: '#7A6E66', cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            {t('auth.guideBtn')}
          </button>
          <LanguagePicker />
        </div>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--accent)', marginBottom: 6, letterSpacing: '-0.5px' }}>
            Tutuu
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {mode === 'login'    && t('auth.signinTitle')}
            {mode === 'register' && t('auth.signupTitle')}
            {mode === 'forgot'   && t('auth.resetDesc')}
          </div>
        </div>

        {/* Error / Success */}
        <Alert ok={false}>{error}</Alert>
        <Alert ok>{success}</Alert>

        {/* ── FORGOT PASSWORD mode ── */}
        {mode === 'forgot' && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#2E2420' }}>
                {t('auth.resetTitle')}
              </div>
            </div>

            {!success && (
              <>
                <div className="form-group">
                  <label className="form-label">{t('auth.emailLabel')}</label>
                  <input
                    className="form-input" type="email" placeholder="you@example.com"
                    value={resetEmail} onChange={e => setResetEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleReset()}
                    autoFocus
                  />
                </div>
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '11px 16px', fontSize: 14, borderRadius: 10 }}
                  onClick={handleReset}
                  disabled={sending}
                >
                  {sending ? t('auth.resetSending') : t('auth.resetEmailBtn')}
                </button>
              </>
            )}

            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <span
                style={{ fontSize: 13, color: 'var(--accent)', cursor: 'pointer', fontWeight: 500 }}
                onClick={() => switchMode('login')}
              >
                {t('auth.backToLogin')}
              </span>
            </div>
          </>
        )}

        {/* ── LOGIN / REGISTER mode ── */}
        {mode !== 'forgot' && (
          <>
            {mode === 'register' && (
              <>
                <div className="form-group">
                  <label className="form-label">{t('auth.nameLabel')}</label>
                  <input className="form-input" placeholder={t('auth.namePlaceholder')} value={form.name} onChange={set('name')} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('auth.roleLabel')}</label>
                  <select className="form-input" value={form.role} onChange={set('role')}>
                    <option value="foreman">{t('roles.foreman')}</option>
                    <option value="worker">{t('roles.worker')}</option>
                  </select>
                </div>
              </>
            )}

            <div className="form-group">
              <label className="form-label">{t('auth.emailLabel')}</label>
              <input className="form-input" type="email" placeholder="you@example.com"
                value={form.email} onChange={set('email')}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
            </div>

            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                <label className="form-label" style={{ margin: 0 }}>{t('auth.passwordLabel')}</label>
                {mode === 'login' && (
                  <span
                    style={{ fontSize: 12, color: 'var(--accent)', cursor: 'pointer', fontWeight: 500 }}
                    onClick={() => { switchMode('forgot'); setResetEmail(form.email) }}
                  >
                    {t('auth.forgotPassword')}
                  </span>
                )}
              </div>
              <input className="form-input" type="password" placeholder="••••••••"
                value={form.password} onChange={set('password')}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 8, padding: '11px 16px', fontSize: 14, borderRadius: 10 }}
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? t('auth.loadingBtn') : mode === 'login' ? t('auth.signinBtn') : t('auth.signupBtn')}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0 12px', color: 'var(--text-muted)', fontSize: 12 }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border-medium)' }} />
              {t('auth.orDivider')}
              <div style={{ flex: 1, height: 1, background: 'var(--border-medium)' }} />
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {APPLE_SIGNIN_ENABLED && (
                <button className="btn" style={{ width: '100%', padding: '10px 16px', fontSize: 14, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  onClick={() => handleProvider('apple')}>
                  <AppleLogo size={18} weight="fill" /> {t('auth.continueApple')}
                </button>
              )}
              <button className="btn" style={{ width: '100%', padding: '10px 16px', fontSize: 14, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                onClick={() => handleProvider('google')}>
                <GoogleLogo size={18} weight="bold" /> {t('auth.continueGoogle')}
              </button>
            </div>

            <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'var(--text-muted)' }}>
              {mode === 'login' ? (
                <>
                  {t('auth.noAccount')}{' '}
                  <span style={{ color: 'var(--accent)', cursor: 'pointer', fontWeight: 500 }}
                    onClick={() => switchMode('register')}>
                    {t('auth.signupLink')}
                  </span>
                </>
              ) : (
                <>
                  {t('auth.haveAccount')}{' '}
                  <span style={{ color: 'var(--accent)', cursor: 'pointer', fontWeight: 500 }}
                    onClick={() => switchMode('login')}>
                    {t('auth.signinLink')}
                  </span>
                </>
              )}
            </div>
          </>
        )}
    </AuthCard>
  )
}
