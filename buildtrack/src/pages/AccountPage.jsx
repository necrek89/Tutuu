import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { Button, FormGroup, Alert } from '../components/UI'
import LanguagePicker from '../components/LanguagePicker'
import { useT } from '../i18n/useLanguage'
import { supabase } from '../lib/supabase'
import { useAsyncGuard } from '../lib/useAsyncGuard'
import { subscribeToPush, unsubscribeFromPush, isSubscribed, isPushSupported } from '../lib/push'
import { PLANS, computeIsLocked, getTrialDaysLeft, fmtPrice, openBillingPortal } from '../lib/billing'
import { isPaddleConfigured, openCheckout } from '../lib/paddle'
import { ALL_UNIT_CODES, unitLabel } from '../i18n/units'

const AVATAR_COLORS = [
  'var(--accent)','var(--success)','#D4A843','#4A7FC1','#9B6B9B',
  '#E07B6A','#6BAA8E','#C4A35A','#7B8EC8','#A67C52'
]

function JoinForeman({ t }) {
  const { sendJoinRequest } = useStore()
  const [code,    setCode]    = useState('')
  const [msg,     setMsg]     = useState('')
  const [loading, guard]      = useAsyncGuard()

  const send = () => code.trim() && guard(async () => {
    setMsg('')
    let inviteCode = code.trim()
    if (inviteCode.includes('?join=')) inviteCode = inviteCode.split('?join=')[1]
    const { error, foremanName } = await sendJoinRequest(inviteCode)
    if (error) setMsg(error)
    else setMsg(t('account.msgRequestSent', { name: foremanName }))
    setCode('')
  })

  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:8 }}>
        <input className="form-input" placeholder={t('account.inviteCodePlaceholder')}
          value={code} onChange={e => setCode(e.target.value)}
          onKeyDown={e => e.key==='Enter' && send()} style={{ flex:1 }} />
        <Button variant="primary" size="sm" onClick={send} disabled={loading}>
          {loading ? '...' : t('account.sendRequestBtn')}
        </Button>
      </div>
      <Alert ok={msg.includes('!')} dense>{msg}</Alert>
    </div>
  )
}

export default function AccountPage() {
  const { profile, fetchProfile } = useStore()
  const { t, lang } = useT()
  const [form,    setForm]    = useState({ name:'', phone:'', company:'', currency:'USD', unit_prefs:[] })
  const [avatarColor, setAvatarColor] = useState('var(--accent)')
  const [uploadingPhoto, photoGuard] = useAsyncGuard()
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [pwForm,  setPwForm]  = useState({ current:'', newPw:'', confirm:'' })
  const [msg,     setMsg]     = useState('')
  const [msgOk,   setMsgOk]   = useState(true)
  const [pwMsg,   setPwMsg]   = useState('')
  const [pwOk,    setPwOk]    = useState(true)
  const [saving,  saveGuard]  = useAsyncGuard()
  const [pwSaving, pwGuard]   = useAsyncGuard()
  const [billingPeriod, setBillingPeriod] = useState('monthly')
  const [portalLoading, portalGuard] = useAsyncGuard()
  const [portalErr, setPortalErr] = useState('')
  const [pushSupported, setPushSupported] = useState(false)
  const [pushEnabled,   setPushEnabled]   = useState(false)
  const [pushLoading,   setPushLoading]   = useState(false)
  const [pushDenied,    setPushDenied]    = useState(false)

  useEffect(() => {
    isPushSupported().then(supported => {
      setPushSupported(supported)
      if (supported) {
        setPushDenied(Notification.permission === 'denied')
        isSubscribed().then(setPushEnabled)
      }
    })
  }, [])

  const togglePush = async () => {
    if (!profile) return
    setPushLoading(true)
    if (pushEnabled) {
      await unsubscribeFromPush(profile.id)
      setPushEnabled(false)
    } else {
      const { error } = await subscribeToPush(profile.id)
      if (error === 'Permission denied') {
        setPushDenied(true)
      } else if (!error) {
        setPushEnabled(true)
      }
    }
    setPushLoading(false)
  }

  useEffect(() => {
    if (profile) {
      setForm({ name: profile.name||'', phone: profile.phone||'', company: profile.company||'', currency: profile.currency || 'USD', unit_prefs: profile.unit_prefs || [] })
      setAvatarColor(profile.avatar_color || 'var(--accent)')
      setAvatarUrl(profile.avatar_url || null)
    }
  }, [profile])

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }))

  // Empty unit_prefs means "not customized yet — show every unit" (see
  // src/i18n/units.js). The first toggle has to materialize that implicit
  // full set before removing/adding one, or unchecking a unit that's only
  // "on" by default would silently add it as an explicit single entry.
  const toggleUnit = (code) => setForm(f => {
    const current = f.unit_prefs.length ? f.unit_prefs : ALL_UNIT_CODES
    return { ...f, unit_prefs: current.includes(code) ? current.filter(c => c !== code) : [...current, code] }
  })

  const saveProfile = () => profile?.id && saveGuard(async () => {
    setMsg(''); setMsgOk(true)
    const { error } = await supabase.from('profiles')
      .update({ name: form.name, phone: form.phone, company: form.company, avatar_color: avatarColor, currency: form.currency, unit_prefs: form.unit_prefs.length ? form.unit_prefs : null })
      .eq('id', profile.id)
    if (error) { setMsg(t('account.msgError', { err: error.message })); setMsgOk(false) }
    else { setMsg(t('account.msgSaved')); setMsgOk(true); fetchProfile?.() }
  })

  const uploadPhoto = (file) => file && profile?.id && photoGuard(async () => {
    const ext  = file.name.split('.').pop()
    const path = `avatars/${profile.id}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('task-photos').upload(path, file, { upsert: true })
    if (upErr) { setMsg(t('account.msgUploadError')); setMsgOk(false); return }
    const { data } = supabase.storage.from('task-photos').getPublicUrl(path)
    await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', profile.id)
    setAvatarUrl(data.publicUrl)
    fetchProfile?.()
    setMsg(t('account.msgSaved')); setMsgOk(true)
  })

  const managePortal = () => portalGuard(async () => {
    setPortalErr('')
    const { ok, error } = await openBillingPortal()
    if (!ok) setPortalErr(`${t('account.billingManagePortalError')}${error ? ` (${error})` : ''}`)
  })

  const changePassword = () => pwGuard(async () => {
    setPwMsg('')
    if (!pwForm.newPw) { setPwMsg(t('account.msgPwEmpty')); setPwOk(false); return }
    if (pwForm.newPw !== pwForm.confirm) { setPwMsg(t('account.msgPwNoMatch')); setPwOk(false); return }
    if (pwForm.newPw.length < 6) { setPwMsg(t('account.msgPwTooShort')); setPwOk(false); return }
    const { error } = await supabase.auth.updateUser({ password: pwForm.newPw })
    if (error) { setPwMsg(t('account.msgError', { err: error.message })); setPwOk(false) }
    else { setPwMsg(t('account.msgPwChanged')); setPwOk(true); setPwForm({ current:'', newPw:'', confirm:'' }) }
  })

  const initials = (form.name || profile?.name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{t('account.title')}</h1>
        <LanguagePicker compact />
      </div>

      {/* ── Avatar ── */}
      <div className="card card-body" style={{ marginBottom:12 }}>
        <div className="section-title">{t('account.avatarSection')}</div>
        <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:16 }}>
          {avatarUrl
            ? <img src={avatarUrl} alt="avatar" style={{ width:72, height:72, borderRadius:'50%', objectFit:'cover', border:'3px solid #EAE3D8' }} />
            : <div style={{ width:72, height:72, borderRadius:'50%', background:avatarColor, display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, fontWeight:700, color:'#fff', flexShrink:0 }}>
                {initials}
              </div>
          }
          <div>
            <label className="btn btn-sm" style={{ cursor:'pointer', marginBottom:6, display:'block' }}>
              {uploadingPhoto ? t('account.uploadingPhoto') : t('account.uploadPhoto')}
              <input type="file" accept="image/*" style={{ display:'none' }}
                onChange={e => uploadPhoto(e.target.files[0])} />
            </label>
            {avatarUrl && (
              <button className="btn btn-sm btn-danger" onClick={async () => {
                await supabase.from('profiles').update({ avatar_url: null }).eq('id', profile.id)
                setAvatarUrl(null); fetchProfile?.()
              }}>{t('account.removePhoto')}</button>
            )}
          </div>
        </div>

        <div className="section-title">{t('account.colorSection')}</div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {AVATAR_COLORS.map(c => (
            <div key={c} onClick={() => setAvatarColor(c)} style={{
              width:32, height:32, borderRadius:'50%', background:c, cursor:'pointer',
              border: avatarColor===c ? '3px solid #2E2420' : '3px solid transparent',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:11, fontWeight:700, color:'#fff'
            }}>
              {avatarColor===c ? '✓' : ''}
            </div>
          ))}
        </div>
      </div>

      {/* ── Personal Info ── */}
      <div className="card card-body" style={{ marginBottom:12 }}>
        <div className="section-title">{t('account.personalSection')}</div>
        <FormGroup label={t('account.nameLabel')}>
          <input className="form-input" value={form.name} onChange={set('name')} placeholder={t('account.namePlaceholder')} />
        </FormGroup>
        <FormGroup label={t('account.emailLabel')}>
          <input className="form-input" value={profile?.email||''} disabled style={{ opacity:.6 }} />
        </FormGroup>
        <FormGroup label={t('account.roleLabel')}>
          <input className="form-input" value={profile?.role ? t(`roles.${profile.role}`) : ''} disabled style={{ opacity:.6 }} />
        </FormGroup>
        <div className="form-grid-2">
          <FormGroup label={t('account.phoneLabel')}>
            <input className="form-input" value={form.phone} onChange={set('phone')} placeholder={t('account.phonePlaceholder')} />
          </FormGroup>
          <FormGroup label={t('account.companyLabel')}>
            <input className="form-input" value={form.company} onChange={set('company')} placeholder={t('account.companyPlaceholder')} />
          </FormGroup>
        </div>
      </div>

      {/* ── Currency ── */}
      <div className="card card-body" style={{ marginBottom:12 }}>
        <div className="section-title">{t('account.currencySection')}</div>
        <p style={{ fontSize:12, color:'var(--text-secondary)', marginBottom:12, lineHeight:1.5 }}>
          {t('account.currencyDesc')}
        </p>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
          {[
            { code:'USD', symbol:'$',    label:'USD — Доллар'   },
            { code:'EUR', symbol:'€',    label:'EUR — Евро'     },
            { code:'RUB', symbol:'₽',    label:'RUB — Рубль'    },
            { code:'GBP', symbol:'£',    label:'GBP — Фунт'     },
            { code:'AED', symbol:'د.إ',  label:'AED — Дирхам'   },
            { code:'TRY', symbol:'₺',    label:'TRY — Лира'     },
            { code:'KZT', symbol:'₸',    label:'KZT — Тенге'    },
            { code:'UAH', symbol:'₴',    label:'UAH — Гривна'   },
            { code:'GEL', symbol:'₾',    label:'GEL — Лари'     },
            { code:'CNY', symbol:'¥',    label:'CNY — Юань'     },
          ].map(c => (
            <button key={c.code}
              onClick={() => setForm(f => ({ ...f, currency: c.code }))}
              style={{
                padding:'8px 14px', borderRadius:8, cursor:'pointer',
                background: form.currency === c.code ? 'var(--accent)' : 'var(--bg)',
                color: form.currency === c.code ? '#fff' : 'var(--text-primary)',
                border: form.currency === c.code ? '1.5px solid var(--accent)' : '0.5px solid var(--border-medium)',
                fontSize:13, fontWeight: form.currency === c.code ? 500 : 400,
                transition:'all .1s',
              }}
            >
              <span style={{ fontSize:15 }}>{c.symbol}</span>
              <span style={{ marginLeft:6, fontSize:11, color: form.currency === c.code ? 'rgba(255,255,255,0.8)' : 'var(--text-secondary)' }}>{c.code}</span>
            </button>
          ))}
        </div>
        <div style={{ marginTop: msg ? 16 : 0 }}><Alert ok={msgOk} dense>{msg}</Alert></div>
        <div style={{ borderTop:'0.5px solid var(--border)', marginTop:16, paddingTop:16 }}>
          <Button variant="primary" onClick={saveProfile} disabled={saving}>
            {saving ? t('common.saving') : t('account.saveBtn')}
          </Button>
        </div>
      </div>

      {/* ── Units ── */}
      <div className="card card-body" style={{ marginBottom:12 }}>
        <div className="section-title">{t('account.unitsSection')}</div>
        <p style={{ fontSize:12, color:'var(--text-secondary)', marginBottom:12, lineHeight:1.5 }}>
          {t('account.unitsDesc')}
        </p>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
          {ALL_UNIT_CODES.map(code => {
            const active = form.unit_prefs.length === 0 || form.unit_prefs.includes(code)
            return (
              <button key={code} onClick={() => toggleUnit(code)} style={{
                padding:'8px 14px', borderRadius:8, cursor:'pointer',
                background: active ? 'var(--accent)' : 'var(--bg)',
                color: active ? '#fff' : 'var(--text-secondary)',
                border: active ? '1.5px solid var(--accent)' : '0.5px solid var(--border-medium)',
                fontSize:13, fontWeight: active ? 500 : 400,
                transition:'all .1s',
              }}>
                {unitLabel(code, lang)}
              </button>
            )
          })}
        </div>
        <div style={{ borderTop:'0.5px solid var(--border)', marginTop:16, paddingTop:16 }}>
          <Button variant="primary" onClick={saveProfile} disabled={saving}>
            {saving ? t('common.saving') : t('account.saveBtn')}
          </Button>
        </div>
      </div>

      {/* ── Billing / Plan ── */}
      {profile?.role === 'foreman' && (() => {
        const locked = computeIsLocked(profile)
        const daysLeft = getTrialDaysLeft(profile)
        const configured = isPaddleConfigured()
        const hasSubscription = !!profile.plan && !['canceled', 'paused'].includes(profile.subscription_status)
        const statusLabel = profile.plan
          ? `${t(`account.billingPlan${profile.plan === 'pro' ? 'Pro' : 'Standard'}`)} · ${profile.plan_period === 'annual' ? t('account.billingAnnual') : t('account.billingMonthly')}`
          : locked ? t('account.billingTrialEndedMsg') : t('account.billingTrialDaysLeft', { n: daysLeft })
        const statusExtra = profile.subscription_status === 'canceled' ? t('account.billingStatusCanceled')
          : profile.subscription_status === 'paused' ? t('account.billingStatusPaused')
          : profile.scheduled_cancel_at ? t('account.billingCancelsOn', { date: profile.scheduled_cancel_at.slice(0, 10) })
          : profile.subscription_current_period_end ? t('account.billingRenewsOn', { date: profile.subscription_current_period_end.slice(0, 10) })
          : null

        return (
          <div className="card card-body" style={{ marginBottom:12 }}>
            <div className="section-title">{t('account.billingSection')}</div>
            <div style={{ fontSize:13, fontWeight:600, color: locked ? 'var(--danger)' : 'var(--text-primary)', marginBottom:2 }}>
              {statusLabel}
            </div>
            {statusExtra && <div style={{ fontSize:12, color:'var(--text-secondary)', marginBottom:12 }}>{statusExtra}</div>}

            {!hasSubscription && (
              <>
                <div style={{ display:'flex', gap:6, margin:'12px 0' }}>
                  <button className={`filter-btn ${billingPeriod === 'monthly' ? 'active' : ''}`} onClick={() => setBillingPeriod('monthly')}>
                    {t('account.billingMonthly')}
                  </button>
                  <button className={`filter-btn ${billingPeriod === 'annual' ? 'active' : ''}`} onClick={() => setBillingPeriod('annual')}>
                    {t('account.billingAnnual')} · {t('account.billingSaveBadge')}
                  </button>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  {['standard', 'pro'].map(planKey => {
                    const p = PLANS[planKey]
                    const price = billingPeriod === 'annual' ? p.priceAnnual : p.priceMonthly
                    const label = planKey === 'pro' ? t('account.billingPlanPro') : t('account.billingPlanStandard')
                    const subscribeLabel = planKey === 'pro' ? t('account.billingSubscribePro') : t('account.billingSubscribeStandard')
                    return (
                      <div key={planKey} style={{ border:'1px solid var(--border-medium)', borderRadius:10, padding:12 }}>
                        <div style={{ fontSize:13, fontWeight:700, marginBottom:4 }}>{label}</div>
                        <div style={{ fontSize:18, fontWeight:700, color:'var(--accent)', marginBottom:10 }}>
                          ${fmtPrice(price)}
                          <span style={{ fontSize:11, fontWeight:500, color:'var(--text-muted)' }}>
                            /{billingPeriod === 'annual' ? t('account.billingAnnual') : t('account.billingMonthly')}
                          </span>
                        </div>
                        <Button
                          variant="primary" size="sm" disabled={!configured}
                          onClick={() => openCheckout(planKey, billingPeriod, profile)}
                        >
                          {subscribeLabel}
                        </Button>
                      </div>
                    )
                  })}
                </div>
                {!configured && (
                  <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:10 }}>{t('account.billingNotConfiguredMsg')}</div>
                )}
              </>
            )}
            {profile.paddle_customer_id && (
              <div style={{ borderTop:'0.5px solid var(--border)', marginTop:16, paddingTop:16 }}>
                <Button size="sm" onClick={managePortal} disabled={portalLoading}>
                  {portalLoading ? '...' : t('account.billingManagePortal')}
                </Button>
                {portalErr && <div style={{ fontSize:11, color:'var(--danger)', marginTop:6 }}>{portalErr}</div>}
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Change Password ── */}
      <div className="card card-body" style={{ marginBottom:12 }}>
        <div className="section-title">{t('account.passwordSection')}</div>
        <FormGroup label={t('account.newPwLabel')}>
          <input className="form-input" type="password" value={pwForm.newPw}
            onChange={e => setPwForm(f => ({...f, newPw: e.target.value}))}
            placeholder={t('account.newPwPlaceholder')} />
        </FormGroup>
        <FormGroup label={t('account.confirmPwLabel')}>
          <input className="form-input" type="password" value={pwForm.confirm}
            onChange={e => setPwForm(f => ({...f, confirm: e.target.value}))}
            placeholder={t('account.confirmPwPlaceholder')} />
        </FormGroup>
        <Alert ok={pwOk} dense>{pwMsg}</Alert>
        <Button variant="primary" onClick={changePassword} disabled={pwSaving}>
          {pwSaving ? t('common.saving') : t('account.changePwBtn')}
        </Button>
      </div>

      {/* ── Push Notifications ── */}
      <div className="card card-body" style={{ marginBottom:12 }}>
        <div className="section-title">{t('account.notificationsSection')}</div>
        <p style={{ fontSize:12, color:'var(--text-secondary)', marginBottom:12 }}>
          {t('account.notificationsDesc')}
        </p>
        {!pushSupported ? (
          <div style={{ fontSize:12, color:'var(--text-muted)' }}>{t('account.notificationsUnsupported')}</div>
        ) : pushDenied ? (
          <div style={{ fontSize:12, color:'var(--danger)', background:'var(--danger-bg)', padding:'8px 12px', borderRadius:8 }}>
            {t('account.notificationsBlocked')}
          </div>
        ) : pushEnabled ? (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
            <span style={{ fontSize:13, color:'var(--success)', fontWeight:500 }}>{t('account.notificationsOn')}</span>
            <button
              onClick={togglePush}
              disabled={pushLoading}
              style={{ fontSize:12, padding:'6px 14px', borderRadius:8, background:'var(--danger-bg)', color:'var(--danger)', border:'0.5px solid var(--danger-border)', cursor:'pointer', fontWeight:500 }}
            >
              {pushLoading ? '...' : t('account.notificationsDisable')}
            </button>
          </div>
        ) : (
          <button
            onClick={togglePush}
            disabled={pushLoading}
            style={{ fontSize:13, padding:'10px 20px', borderRadius:10, background:'var(--accent)', color:'#fff', border:'none', cursor:'pointer', fontWeight:600, width:'100%' }}
          >
            {pushLoading ? '...' : t('account.notificationsEnable')}
          </button>
        )}
      </div>

      {/* ── Join Foreman (workers only) ── */}
      {profile?.role === 'worker' && (
        <div className="card card-body" style={{ marginBottom:12 }}>
          <div className="section-title">{t('account.joinForemanSection')}</div>
          <p style={{ fontSize:12, color:'#7A6E66', marginBottom:10 }}>
            {t('account.joinForemanDesc')}
          </p>
          <JoinForeman t={t} />
        </div>
      )}

    </div>
  )
}
