import { useState } from 'react'
import { useT } from '../i18n/useLanguage'
import translations from '../i18n/translations'
import { PLANS, fmtPrice } from '../lib/plans'
import './landing.css'

// Standalone, deep-linkable version of the landing page's PricingModal —
// Paddle's domain-verification flow requires a direct URL to a pricing page,
// which a modal-only pricing section can't satisfy.
export default function PricingPage() {
  const { lang } = useT()
  const l = translations[lang]?.landing || translations.en.landing
  const [period, setPeriod] = useState('monthly')
  const plans = [
    { key: 'standard', name: l.planStandardName, desc: l.planStandardDesc, ...PLANS.standard },
    { key: 'pro',      name: l.planProName,      desc: l.planProDesc,      ...PLANS.pro },
  ]

  return (
    <div className="ldg">
      <header className="ld-nav">
        <a className="ld-logo" href="/">tutuu<em>.</em></a>
        <a className="ld-nav-link" href="/">← Back to home</a>
      </header>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '64px 24px 96px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 32, fontWeight: 500, marginBottom: 8 }}>{l.pricingTitle}</h1>
        <p style={{ fontSize: 15, color: 'var(--ld-muted)', lineHeight: 1.6, marginBottom: 28 }}>{l.pricingSubtitle}</p>

        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 28 }}>
          {['monthly', 'annual'].map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              padding: '7px 16px', borderRadius: 20, fontSize: 13, fontWeight: 500, cursor: 'pointer',
              border: period === p ? '1px solid var(--ld-orange)' : '1px solid var(--ld-border)',
              background: period === p ? 'color-mix(in srgb, var(--ld-orange) 12%, transparent)' : 'transparent',
              color: period === p ? 'var(--ld-orange)' : 'var(--ld-muted)',
            }}>
              {p === 'monthly' ? l.planPeriodMonthly : `${l.planPeriodAnnual} · ${l.planAnnualSaveBadge}`}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 28 }}>
          {plans.map(plan => (
            <div key={plan.key} style={{ border: '0.5px solid var(--ld-border)', borderRadius: 14, padding: '24px 18px', textAlign: 'left', background: 'var(--ld-surface)' }}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{plan.name}</div>
              <div style={{ fontSize: 13, color: 'var(--ld-muted)', marginBottom: 14, lineHeight: 1.5 }}>{plan.desc}</div>
              <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--ld-orange)' }}>
                ${fmtPrice(period === 'annual' ? plan.priceAnnual : plan.priceMonthly)}
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--ld-muted)' }}>
                  /{period === 'annual' ? l.planPeriodAnnual : l.planPeriodMonthly}
                </span>
              </div>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 13, color: 'var(--ld-muted)', marginBottom: 20 }}>{l.trialNote}</p>

        <a
          href="/app"
          style={{
            display: 'inline-block', textDecoration: 'none',
            background: 'var(--ld-orange)', color: '#fff', border: 'none',
            borderRadius: 8, padding: '13px 40px', fontSize: 14,
            fontWeight: 500, cursor: 'pointer',
          }}
        >
          {l.pricingCta}
        </a>
      </div>
    </div>
  )
}
