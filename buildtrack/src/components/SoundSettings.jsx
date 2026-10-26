import { useState } from 'react'
import { useT } from '../i18n/useLanguage'
import { getSoundPrefs, setSoundPref, setHapticsPref, playSound } from '../lib/sound'

function Row({ label, on, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '6px 0' }}>
      <span style={{ fontSize: 13 }}>{label}</span>
      <button
        role="switch" aria-checked={on} onClick={() => onChange(!on)}
        style={{
          width: 44, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer', padding: 3, flexShrink: 0,
          background: on ? 'var(--accent)' : 'var(--border-medium)', transition: 'background .15s',
          display: 'flex', alignItems: 'center', justifyContent: on ? 'flex-end' : 'flex-start',
        }}
      >
        <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', display: 'block' }} />
      </button>
    </div>
  )
}

export default function SoundSettings({ showHaptics = false }) {
  const { t } = useT()
  const [prefs, setPrefs] = useState(getSoundPrefs)

  const toggleSound = (on) => {
    setSoundPref(on)
    setPrefs(getSoundPrefs())
    if (on) playSound('success')
  }
  const toggleHaptics = (on) => {
    setHapticsPref(on)
    setPrefs(getSoundPrefs())
    if (on) playSound('success')
  }

  return (
    <div className="card card-body" style={{ marginBottom: 12 }}>
      <div className="section-title">{t('account.soundsSection')}</div>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>{t('account.soundsDesc')}</p>
      <Row label={t('account.soundsOn')} on={prefs.sound} onChange={toggleSound} />
      {showHaptics && <Row label={t('account.hapticsOn')} on={prefs.haptics} onChange={toggleHaptics} />}
    </div>
  )
}
