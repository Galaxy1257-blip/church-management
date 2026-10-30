import Link from 'next/link';

const FEATURES: { title: string; body: string; icon: React.ReactNode }[] = [
  {
    title: 'Members & care',
    body: 'One profile per person: contact, address, photo, group, and who to follow up.',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20c0-3 3-5 6-5s6 2 6 5" />
        <circle cx="17" cy="9" r="2.4" />
        <path d="M15 14c3 0 6 1.6 6 4.5" />
      </svg>
    ),
  },
  {
    title: 'Offerings & funds',
    body: 'Offering, tithe, mini harvest, annual harvest and welfare — with a simple total.',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18M7 15h4" />
      </svg>
    ),
  },
  {
    title: 'Attendance',
    body: 'Count the service in seconds. See the Sunday trend without a spreadsheet.',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 20V9l8-5 8 5v11" />
        <path d="M9 20v-6h6v6" />
      </svg>
    ),
  },
  {
    title: 'SMS that arrives',
    body: 'Birthdays, care messages, announcements. Buy credit in the app, no contracts.',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
      </svg>
    ),
  },
  {
    title: 'Groups & leaders',
    body: 'Choirs, fellowships and departments, each with its people, leader and meetings.',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="7" r="3" />
        <path d="M6 21v-2a6 6 0 0 1 12 0v2" />
        <path d="M3 11h3M18 11h3" />
      </svg>
    ),
  },
  {
    title: 'Reports you can read',
    body: 'Giving by fund, attendance by Sunday, and a clean export for the board.',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 19V5M4 19h16" />
        <path d="M8 15l3-4 3 2 4-6" />
      </svg>
    ),
  },
];

const INCLUDED = [
  'Unlimited members and branches',
  'Offerings, expenses, reports and audit trail',
  'Care, follow-up, groups and SMS wallet',
  'Pay by MoMo or card — or cash with your onboarding agent',
];

const BARS = [46, 64, 52, 78, 96, 70, 84];

export default function HomePage() {
  return (
    <>
      <section className="pub-inner">
        <div className="pub-hero">
          <div>
            <div className="eyebrow">Built for churches in Ghana</div>
            <h1>
              Your church,
              <br />
              <em>in one calm place.</em>
            </h1>
            <p className="pub-lead">
              Members, offerings, attendance, care and SMS — together, in plain English. Works on the phone in your
              pocket, even when the network is slow.
            </p>
            <div className="pub-hero-cta">
              <Link href="/signup" className="pub-btn">
                Start your 14-day free trial
              </Link>
              <Link href="/login" className="pub-btn ghost">
                Sign in
              </Link>
            </div>
            <div className="pub-trust">
              <span>No card to start</span>
              <span>Pay by MoMo or card</span>
              <span>Cash payments welcome</span>
            </div>
          </div>

          <div>
            <div className="pub-preview">
              <div className="pub-preview-top">
                <i />
                <i />
                <i />
                <span>Demo Church · This Sunday</span>
              </div>
              <div className="pub-preview-body">
                <div className="pub-metrics">
                  <div className="pub-metric">
                    <span>Attendance</span>
                    <strong>214</strong>
                    <small>+12 from last week</small>
                  </div>
                  <div className="pub-metric">
                    <span>Offering</span>
                    <strong>GHS 3,480</strong>
                    <small>Tithe + welfare</small>
                  </div>
                </div>
                <div className="pub-bars">
                  {BARS.map((h, i) => (
                    <i key={i} style={{ height: `${h}%` }} />
                  ))}
                </div>
                <div className="pub-person">
                  <span className="avatar">AN</span>
                  <div>
                    <b>Akosua Nyarko</b>
                    <small>Care · follow up today</small>
                  </div>
                </div>
                <div className="pub-person">
                  <span className="avatar">KO</span>
                  <div>
                    <b>Kojo Owusu</b>
                    <small>First-time visitor</small>
                  </div>
                </div>
              </div>
            </div>
            <div className="pub-note-float">
              <b>8:00 pm</b>
              <span>Bible verse sent to members who opted in</span>
            </div>
          </div>
        </div>
      </section>

      <section className="pub-section" id="features">
        <div className="pub-inner">
          <div className="pub-section-head">
            <div className="eyebrow">What it does</div>
            <h2>Everything the week needs, nothing it does not</h2>
            <p>Turn a module off in Settings if your church does not use it.</p>
          </div>
          <div className="pub-features">
            {FEATURES.map((f) => (
              <div className="pub-feature" key={f.title}>
                <div className="ic">{f.icon}</div>
                <b>{f.title}</b>
                <span>{f.body}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pub-section" id="pricing">
        <div className="pub-inner">
          <div className="pub-section-head">
            <div className="eyebrow">One simple price</div>
            <h2>Per church, not per member</h2>
          </div>
          <div className="pub-price">
            <div className="pub-pricecard">
              <div className="pub-amount">
                GHS 100 <small>/ month, per church</small>
              </div>
              <p style={{ margin: 0, fontSize: '0.9rem', opacity: 0.9 }}>
                Every module included. Start with 14 days free — no card needed.
              </p>
              <ul>
                {INCLUDED.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <Link href="/signup" className="pub-btn full">
                Start free trial
              </Link>
            </div>
            <div className="pub-notes">
              <div className="pub-note">
                <b>Paying cash?</b>
                Your onboarding agent records it in the office and unlocks the church the same day.
              </div>
              <div className="pub-note">
                <b>What happens if we do not pay?</b>
                You keep full access for 7 days after the due date. After that the workspace pauses — your data stays
                safe and nothing is deleted.
              </div>
              <div className="pub-note">
                <b>Need a hand?</b>
                Call or email{' '}
                <a href="mailto:app.omnilabs.dev@gmail.com">app.omnilabs.dev@gmail.com</a>. A real person walks you
                through setup.
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
