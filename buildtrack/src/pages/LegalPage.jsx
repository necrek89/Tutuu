import './landing.css'


const CONTACT_EMAIL = 'tuskul.bor@gmail.com'
const COMPANY = 'Tutuu'
const GOVERNING_LAW = 'Slovakia'
const LAST_UPDATED = 'July 28, 2026'

function Shell({ title, children }) {
  return (
    <div className="ldg">
      <header className="ld-nav">
        <a className="ld-logo" href="/">tutuu<em>.</em></a>
        <a className="ld-nav-link" href="/">← Back to home</a>
      </header>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '64px 24px 96px' }}>
        <h1 style={{ fontSize: 32, fontWeight: 500, marginBottom: 8 }}>{title}</h1>
        <p style={{ color: 'var(--ld-muted)', fontSize: 13, marginBottom: 40 }}>Last updated: {LAST_UPDATED}</p>
        <div className="ld-legal-body">{children}</div>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 18, fontWeight: 500, marginBottom: 10 }}>{title}</h2>
      <div style={{ fontSize: 14, lineHeight: 1.75, color: 'var(--ld-ink)' }}>{children}</div>
    </section>
  )
}

export function TermsPage() {
  return (
    <Shell title="Terms of Service">
      <Section title="1. Agreement to Terms">
        <p>These Terms of Service ("Terms") govern your access to and use of {COMPANY} (the "Service"), a
        construction crew and project management application. By creating an account or using the Service,
        you agree to be bound by these Terms. If you do not agree, do not use the Service.</p>
      </Section>
      <Section title="2. The Service">
        <p>{COMPANY} lets construction foremen and their teams manage projects, tasks, materials, tools,
        attendance, and payments. You are responsible for the accuracy of the data you and your team enter
        into the Service.</p>
      </Section>
      <Section title="3. Free Trial">
        <p>New foreman accounts receive a 30-day free trial with full access to all features. No payment
        method is required to start a trial. After the trial ends, creating, editing, or deleting data is
        blocked until you subscribe to a paid plan — your existing data remains visible and is never deleted
        for non-payment.</p>
      </Section>
      <Section title="4. Subscriptions and Billing">
        <p>Paid plans (Standard and Pro) are billed monthly or annually, as selected at checkout. Payments are
        processed by <strong>Paddle.com Market Limited</strong>, our payment provider and Merchant of Record.
        Paddle handles payment collection, taxes, and invoicing on our behalf; by subscribing, you also agree
        to <a href="https://www.paddle.com/legal/checkout-buyer-terms" target="_blank" rel="noreferrer">Paddle's Buyer Terms</a>.
        Subscriptions renew automatically at the end of each billing period unless cancelled beforehand.</p>
      </Section>
      <Section title="5. Cancellation">
        <p>You may cancel your subscription at any time from your account settings. Cancellation takes effect
        at the end of the current billing period; you retain access until then. See our
        <a href="/refund" style={{ color: 'var(--ld-orange)', textDecoration: 'none' }}> Refund Policy</a> for
        details on refunds.</p>
      </Section>
      <Section title="6. Account Responsibilities">
        <p>You are responsible for maintaining the confidentiality of your account credentials and for all
        activity under your account. Foreman accounts are responsible for the workers and managers they invite
        into their team.</p>
      </Section>
      <Section title="7. Your Data">
        <p>You retain ownership of all project, task, and team data you submit to the Service. We do not sell
        your data. See our <a href="/privacy" style={{ color: 'var(--ld-orange)', textDecoration: 'none' }}>Privacy Policy</a> for
        details on how we collect, use, and protect your information.</p>
      </Section>
      <Section title="8. Acceptable Use">
        <p>You agree not to misuse the Service — including attempting to disrupt it, reverse-engineer it, or
        use it to store unlawful content.</p>
      </Section>
      <Section title="9. Disclaimer and Limitation of Liability">
        <p>The Service is provided "as is" without warranties of any kind. To the maximum extent permitted by
        law, {COMPANY} is not liable for indirect, incidental, or consequential damages arising from your use
        of the Service.</p>
      </Section>
      <Section title="10. Changes to These Terms">
        <p>We may update these Terms from time to time. Continued use of the Service after changes take effect
        constitutes acceptance of the revised Terms.</p>
      </Section>
      <Section title="11. Governing Law">
        <p>These Terms are governed by the laws of {GOVERNING_LAW}, without regard to conflict-of-law
        principles.</p>
      </Section>
      <Section title="12. Contact">
        <p>Questions about these Terms? Contact us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
      </Section>
    </Shell>
  )
}

export function PrivacyPage() {
  return (
    <Shell title="Privacy Policy">
      <Section title="1. What We Collect">
        <p>Account information (name, email, phone), project and task data you and your team create, uploaded
        photos and documents, attendance and payment records you enter, and basic usage data (device type,
        browser, log-in times) needed to operate and secure the Service.</p>
      </Section>
      <Section title="2. How We Use It">
        <p>We use this data solely to provide and improve the Service: displaying your projects and team to
        you, sending notifications you've opted into, processing subscription billing, and diagnosing bugs.
        We do not sell your personal data to third parties.</p>
      </Section>
      <Section title="3. Who We Share It With">
        <ul style={{ paddingLeft: 20 }}>
          <li><strong>Supabase</strong> — our database and authentication provider, which hosts all application data.</li>
          <li><strong>Paddle.com Market Limited</strong> — our payment processor and Merchant of Record, which
          receives billing-relevant details (email, subscription status) to process payments.</li>
        </ul>
        <p>We do not share your data with any other third party except where required by law.</p>
      </Section>
      <Section title="4. Data Retention">
        <p>We retain your data for as long as your account is active. If you delete your account, we delete
        your personal data within a reasonable period, except where retention is required for legal or
        billing-record purposes.</p>
      </Section>
      <Section title="5. Your Rights">
        <p>You may request access to, correction of, or deletion of your personal data at any time by
        contacting us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
      </Section>
      <Section title="6. Security">
        <p>We use industry-standard measures (encrypted connections, access controls, row-level security on
        our database) to protect your data. No method of transmission or storage is 100% secure.</p>
      </Section>
      <Section title="7. Changes to This Policy">
        <p>We may update this Privacy Policy from time to time; material changes will be reflected by updating
        the "Last updated" date above.</p>
      </Section>
      <Section title="8. Contact">
        <p>Questions about this Privacy Policy? Contact us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
      </Section>
    </Shell>
  )
}

export function RefundPage() {
  return (
    <Shell title="Refund Policy">
      <Section title="Free Trial">
        <p>Every foreman account starts with a 30-day free trial with full access to the Service — no card
        required. This gives you time to fully evaluate {COMPANY} before paying anything.</p>
      </Section>
      <Section title="Paid Subscriptions">
        <p>Because of the free trial, subscription payments are generally non-refundable once a billing period
        has started. If you cancel, you keep access until the end of the period you've already paid for — we
        do not offer prorated refunds for unused time within a period.</p>
      </Section>
      <Section title="Exceptions">
        <p>If you believe you were charged in error, were double-billed, or experienced a technical issue that
        prevented you from using the Service, contact us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> within
        14 days of the charge. We review these requests on a case-by-case basis.</p>
      </Section>
      <Section title="How Refunds Are Processed">
        <p>Payments are processed by <strong>Paddle.com Market Limited</strong> as our Merchant of Record.
        Approved refunds are issued by Paddle back to your original payment method, and may also be requested
        directly from Paddle in accordance with their own buyer policies.</p>
      </Section>
      <Section title="Contact">
        <p>Refund questions: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
      </Section>
    </Shell>
  )
}
