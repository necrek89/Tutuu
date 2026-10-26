import { useState, useEffect } from 'react'
import { useT } from '../i18n/useLanguage'
import { TEXT_SIZES, getTextSize, setTextSize } from '../lib/textSize'

const LABEL_KEYS = { 100: 'textNormal', 115: 'textLarge', 130: 'textLarger', 150: 'textLargest' }

export default function TextSizeSettings() {
  const { t } = useT()
  const [size, setSize] = useState(getTextSize)
  useEffect(() => {
    const sync = () => setSize(getTextSize())
    window.addEventListener('tutuu-text-size', sync)
    return () => window.removeEventListener('tutuu-text-size', sync)
  }, [])

  return (
    <div className="card card-body" style={{ marginBottom: 12 }}>
      <div className="section-title">{t('account.textSizeSection')}</div>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>{t('account.textSizeDesc')}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {TEXT_SIZES.map(pct => (
          <button
            key={pct}
            onClick={() => setTextSize(pct)}
            aria-pressed={size === pct}
            style={{
              padding: '10px 2px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
              border: size === pct ? '1.5px solid var(--accent)' : '0.5px solid var(--border-medium)',
              background: size === pct ? 'var(--accent-light)' : 'var(--bg-subtle)',
              color: size === pct ? 'var(--accent)' : 'var(--text-primary)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            }}
          >
            {/* The letter keeps a fixed size so the four buttons always show the difference */}
            <span style={{ fontSize: 12 + (pct - 100) / 5, fontWeight: 600, lineHeight: 1, textSizeAdjust: '100%', WebkitTextSizeAdjust: '100%' }}>Aa</span>
            <span style={{ fontSize: 10 }}>{t(`account.${LABEL_KEYS[pct]}`)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
