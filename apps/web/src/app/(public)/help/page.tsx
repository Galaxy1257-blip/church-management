'use client';
// Help & FAQ: the public nav "Help" used to scroll to the contact footer and
// nothing else. This is a real, searchable answer book. Every answer is grounded
// in what the app actually does — no promised screen that does not exist.
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CONTACT_EMAIL, OPERATOR } from '../legal-meta';

type Faq = { q: string; a: string; cta?: { href: string; label: string } };
type Group = { id: string; title: string; items: Faq[] };

const SUPPORT: Faq['cta'] = { href: `mailto:${CONTACT_EMAIL}?subject=ChMS%20help`, label: 'Email support' };

const GROUPS: Group[] = [
  {
    id: 'start',
    title: 'Getting started',
    items: [
      {
        q: 'How do I start using ChMS for my church?',
        a: 'Create a workspace on the sign-up page. You get 14 days free with no card. The first account is the church admin; you can then add staff and set their roles.',
        cta: { href: '/signup', label: 'Start free trial' },
      },
      {
        q: 'What is my church code and where do I find it?',
        a: 'Your church code (slug) is the short name in your web address, chosen at sign-up. Staff sign-in asks for it. If you forget it, ask your church admin or email support.',
        cta: { href: '/login', label: 'Sign in' },
      },
      {
        q: 'I forgot my password.',
        a: 'Use "Forgot password" on the sign-in page. We send a reset link or code to the phone or email on your account.',
        cta: { href: '/forgot-password', label: 'Reset password' },
      },
      {
        q: 'I was invited as staff or a member — do I sign up?',
        a: 'No. If the church already added you, sign in with the phone or email they used. Members land in the member portal; staff land in the app. "Sign up" is only for creating a brand-new church workspace.',
        cta: { href: '/login', label: 'Sign in' },
      },
      {
        q: 'Why did I land in a different screen after signing in?',
        a: 'ChMS opens the area your role can use. Admins and staff see the dashboard; ushers and door staff may start in usher mode; members see the member portal. Your menu only lists what your role may open.',
      },
    ],
  },
  {
    id: 'billing',
    title: 'Paying & billing',
    items: [
      {
        q: 'How much does it cost?',
        a: 'GH₵ 100 per month, per church — not per member. Every module is included. Start with 14 days free, no card needed.',
      },
      {
        q: 'How do I pay?',
        a: 'Open Billing in the app and pay by MoMo or card. Paying cash? Your onboarding agent records it in the office and unlocks the church the same day.',
      },
      {
        q: 'My workspace is locked / paused. What happened?',
        a: 'A workspace pauses when payment is overdue. You keep full access for 7 days after the due date; after that it pauses. Your data stays safe and nothing is deleted. Pay in Billing to unlock immediately.',
      },
      {
        q: 'Can I still delete my account while the workspace is locked?',
        a: 'Yes. Deleting your own account is a legal right, not a paid feature. It works even when the church is paused — open About → My account, or the member portal.',
      },
      {
        q: 'Do you offer refunds?',
        a: 'Write to support with your church name and payment date. Refunds are handled case by case under the Terms of Use.',
        cta: { href: '/terms', label: 'Read the Terms' },
      },
    ],
  },
  {
    id: 'members',
    title: 'Members',
    items: [
      {
        q: 'How do I add a member?',
        a: 'Open Members → Add member. Fill in name and phone; everything else (photo, address, group, birthday) is optional. Ghana phone numbers are normalised automatically.',
      },
      {
        q: 'Can I import many members at once?',
        a: 'Yes. Members has a CSV import. Paste or upload rows with the column headings shown; the app previews what it will create before you confirm.',
      },
      {
        q: 'How do I edit or remove a member?',
        a: 'Open the member profile drawer and edit the fields. To remove someone, use delete in the drawer — this anonymises their personal details while keeping giving totals intact for the church accounts.',
      },
      {
        q: 'What is the QR membership card?',
        a: 'Each member can have a QR card used for fast check-in. The token is hashed, so a lost card cannot be reused to impersonate someone.',
      },
      {
        q: 'How do households and guardians work?',
        a: 'Link people into a household and record guardians for a child. Check-in and pick-up use the allowed guardians you set, so only the right people can collect a child.',
      },
      {
        q: 'I think I have a duplicate member.',
        a: 'Search by name or phone in Members. If two records are the same person, keep the one with history and delete the other; giving totals are preserved on the record you keep.',
      },
    ],
  },
  {
    id: 'attendance',
    title: 'Attendance & check-in',
    items: [
      {
        q: 'How do I count a service?',
        a: 'Open Services, pick the service, and use the headcount. It works offline on a phone and syncs when the network returns. The Sunday trend builds itself.',
      },
      {
        q: 'How do I check someone in?',
        a: 'Open Check-in and search the member, scan their QR card, or tap them in the list. Children use a dual ticket so check-in and pick-up are both recorded.',
      },
      {
        q: 'What is usher mode?',
        a: 'A simplified, big-button view for door staff: Today, Check-in, Attendance, Visitors and Care. Toggle it from the menu footer. It only appears for roles that can run the door.',
      },
      {
        q: 'Why did I get an overcapacity warning?',
        a: 'The room warns at 85% and 95% of its set capacity so you can manage the door. Set the capacity on the service or room.',
      },
      {
        q: 'Can I show attendance on a projector?',
        a: 'Yes — there is a projection screen for the service so the congregation can see the count live.',
      },
    ],
  },
  {
    id: 'money',
    title: 'Offerings & money',
    items: [
      {
        q: 'How do I record an offering?',
        a: 'Open Collection (or Finance) and enter the amount against a fund — offering, tithe, welfare, harvest and so on. Amounts are stored in pesewas, so totals never drift.',
      },
      {
        q: 'What are the two counters?',
        a: 'Cash and cheque are counted separately and reconciled, so the board sees exactly what was received in each form.',
      },
      {
        q: 'How do I record an expense?',
        a: 'Open Expenses, enter the amount, category and note. Expenses sit alongside giving in the finance reports.',
      },
      {
        q: 'Can I get a report or export for the board?',
        a: 'Yes. Finance and the report screens give giving by fund and attendance by Sunday, with a clean JSON export and a readable, church-branded PDF.',
      },
      {
        q: 'How does online giving work?',
        a: 'If your church turns on online giving, members get a giving link and can pay by MoMo or card. The money switch asks whether you want online giving and honours your answer.',
      },
      {
        q: 'Why does money show as GH₵ 1,234.00?',
        a: 'That is the one cedi format used everywhere — the GH₵ symbol, thousands separators and two decimal places. SMS keeps the plain "GHS" because the cedi symbol is not in the GSM-7 character set.',
      },
    ],
  },
  {
    id: 'sms',
    title: 'SMS & messages',
    items: [
      {
        q: 'How do I buy SMS credit?',
        a: 'Open SMS and top up the wallet in the app — no contracts. Credit is shared by the church and drawn down as messages send.',
      },
      {
        q: 'My messages are not arriving.',
        a: 'Check the wallet has credit, the number is a valid Ghana mobile, and the member has not opted out. Long messages split into segments and cost more; the screen shows the segment count before you send.',
      },
      {
        q: 'How does someone stop receiving messages?',
        a: 'Replying STOP opts the number out, and the app honours it. You can also turn off SMS consent on a member profile. Opted-out numbers are skipped on every send.',
      },
      {
        q: 'Are birthday and care messages automatic?',
        a: 'Yes. Birthdays, care follow-ups and announcements can send automatically. Automated follow-up honours the quiet hours you set, so people are not texted late at night.',
      },
      {
        q: 'Why does my message cost more than one credit?',
        a: 'A message longer than one SMS segment is billed per segment. The composer shows the segment count so there are no surprises.',
      },
    ],
  },
  {
    id: 'care',
    title: 'Care, prayer & welfare',
    items: [
      {
        q: 'How do I assign a follow-up?',
        a: 'Open Care, create a task and pick the member and type. Ushers, Sunday School teachers, elders and the follow-up team can see the care they are allowed to.',
      },
      {
        q: 'Are counselling notes private?',
        a: 'Counselling notes are stored encrypted and are restricted to authorised care staff. They are never shown on a member portal or in an export.',
      },
      {
        q: 'What is the prayer wall?',
        a: 'Members can post prayer requests; the church can mark them answered and track them over time.',
      },
      {
        q: 'How do I record welfare help?',
        a: 'Open Welfare, write down the situation and the amount given (rent, a hospital bill, school fees). Welfare is a fund, so it appears in the giving reports.',
      },
      {
        q: 'What is the drip / follow-up pipeline?',
        a: 'A staged pipeline that moves a visitor or new member through follow-up steps over time, with quiet hours honoured between messages.',
      },
    ],
  },
  {
    id: 'groups',
    title: 'Groups, cells & branches',
    items: [
      {
        q: 'How do I create a group or department?',
        a: 'Open Groups, add the choir, fellowship or department, then assign its people, leader and meetings.',
      },
      {
        q: 'What is a cell meeting report?',
        a: 'Cell leaders record the topic, offering and attendance for each meeting, so the church sees small-group life without a spreadsheet.',
      },
      {
        q: 'How do branches work?',
        a: 'Each branch sees its own data (row-level security). A member transfer between branches needs approval, and there is a screen for approving transfers.',
      },
      {
        q: 'How do I transfer a member to another branch?',
        a: 'Start the transfer from the member or Org screen; the receiving branch admin approves it. Transfers use their own permission, separate from editing members.',
      },
    ],
  },
  {
    id: 'switches',
    title: 'Switches, roles & access',
    items: [
      {
        q: 'A section says "Area switched off". What do I do?',
        a: 'A church admin turned that module off in Settings → App sections. Turn it back on there and the menu, dashboard cards and API all follow the switch.',
      },
      {
        q: 'A page says "Not available for your role".',
        a: 'Your role does not have the permission that page needs. Ask a church admin to grant it if you should have access — this is a permission, not a switch.',
      },
      {
        q: 'How do I turn a module on or off?',
        a: 'Settings → App sections. Every feature has an off switch, and the switch gates the API path too — a switched-off section refuses requests, not just hides the button.',
      },
      {
        q: 'Who can see what?',
        a: 'The menu and every screen are derived from the permissions the API returns for your session, never a hardcoded role. A Sunday School teacher with a class sees only that class.',
      },
      {
        q: 'What is "Extras"?',
        a: 'Extra tools the platform office switched on for your church specifically. The entry only appears when the office has enabled something.',
      },
    ],
  },
  {
    id: 'bible',
    title: 'Bible & daily verse',
    items: [
      {
        q: 'Where is the Bible in the app?',
        a: 'There is a persistent Bible button in the header, available to every role with no permission needed. It opens the reader dock.',
      },
      {
        q: 'What is the daily verse?',
        a: 'A verse of the day rotates from the bundled Bibles and can be sent to members who opted in, around 8:00 pm.',
      },
      {
        q: 'Which languages and translations are available?',
        a: 'The reader bundles several Bibles, each with its own language book names. The bundles work offline once loaded.',
      },
    ],
  },
  {
    id: 'appearance',
    title: 'Appearance & your phone',
    items: [
      {
        q: 'How do I change the theme or turn on dark mode?',
        a: 'Settings → Appearance. Pick a colour theme or switch on dark mode; the choice is saved for your account.',
      },
      {
        q: 'Can I install ChMS on my phone?',
        a: 'Yes. It is a progressive web app — use your browser\'s "Add to Home Screen" / "Install" option. It then opens like an app and keeps working on a slow network.',
      },
      {
        q: 'Does it work offline?',
        a: 'Headcount and check-in work offline and sync later. The Bible bundles are stored on the device. Screens that need live data show a clear message when the network is down.',
      },
      {
        q: 'How do I get notifications?',
        a: 'Allow notifications when your browser asks. The app uses them for the daily verse and reminders; you can turn them off in your device or browser settings.',
      },
      {
        q: 'The text is too small on my phone.',
        a: 'The app is built for a phone in the pew. You can also increase text size in your device accessibility settings; the layout reflows rather than clipping.',
      },
    ],
  },
  {
    id: 'privacy',
    title: 'Your data & privacy',
    items: [
      {
        q: 'How do I delete my own account?',
        a: 'Open About → My account → Delete, or use the member portal. We anonymise your personal details, revoke your sessions and keep only the giving amounts the church needs for its accounts. This right is never behind a paywall or a switch.',
      },
      {
        q: 'What happens to my data when I delete my account?',
        a: 'Your name, phone, email, photo and notes are removed or anonymised; counselling and prayer notes tied to you are deleted; giving totals are kept without your identity. The audit log records that an erasure happened, never a copy of the erased data.',
      },
      {
        q: 'Where is church data stored?',
        a: 'Data is held with the processors named in the Privacy Policy. Each church and branch is isolated by row-level security, and the audit trail is hash-chained.',
        cta: { href: '/privacy', label: 'Read the Privacy Policy' },
      },
      {
        q: 'Can I export our church data?',
        a: 'Yes — the report and member screens offer JSON exports and branded PDFs. For a full data request, email support.',
        cta: SUPPORT,
      },
    ],
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    items: [
      {
        q: 'A page will not load or shows an error.',
        a: 'Refresh once. If it persists, check your network, then sign out and back in. A persistent "Area switched off" or "Not available for your role" is a setting, not a fault — see the Switches section above.',
      },
      {
        q: 'I am locked out completely.',
        a: 'Use Forgot password. If the workspace itself is paused for billing, an admin can pay in Billing to unlock; your data is never deleted while paused.',
        cta: { href: '/forgot-password', label: 'Reset password' },
      },
      {
        q: 'The app feels slow.',
        a: 'ChMS is built for slow networks: headcount and the Bible work offline, and lists paginate. Installing it to your home screen caches the shell for faster opens.',
      },
      {
        q: 'Something is broken or I have an idea.',
        a: 'Email support — a real person reads every message. Include your church name, what you clicked and what you expected.',
        cta: SUPPORT,
      },
    ],
  },
];

const TOTAL = GROUPS.reduce((n, g) => n + g.items.length, 0);

export default function HelpPage() {
  const [query, setQuery] = useState('');

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return GROUPS;
    return GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((f) => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q)),
    })).filter((g) => g.items.length > 0);
  }, [query]);

  const count = shown.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="pub-inner help">
      <div className="eyebrow">Help &amp; FAQ</div>
      <h1>How can we help?</h1>
      <p className="help-lead">
        Plain answers to the things churches ask most. Search below, or browse by topic. Still stuck?{' '}
        <a href={`mailto:${CONTACT_EMAIL}?subject=ChMS%20help`}>Email us</a> — a real person answers.
      </p>

      <div className="help-search">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search help… e.g. locked, SMS, delete, offering"
          aria-label="Search help topics"
        />
        <span className="help-count" aria-live="polite">
          {query.trim() ? `${count} of ${TOTAL} answers` : `${TOTAL} answers`}
        </span>
      </div>

      <div className="help-quick">
        <Link href="/login" className="pub-btn ghost small">Sign in</Link>
        <Link href="/signup" className="pub-btn ghost small">Start free trial</Link>
        <Link href="/forgot-password" className="pub-btn ghost small">Reset password</Link>
        <a href={`mailto:${CONTACT_EMAIL}?subject=ChMS%20help`} className="pub-btn ghost small">Email support</a>
      </div>

      {shown.length === 0 ? (
        <div className="card help-none">
          <p>No answer matches “{query.trim()}”.</p>
          <p className="muted">Try a simpler word, or email us and we will answer personally.</p>
          <a className="pub-btn small" href={`mailto:${CONTACT_EMAIL}?subject=ChMS%20help`}>Email support</a>
        </div>
      ) : (
        shown.map((g) => (
          <section key={g.id} className="help-group" aria-labelledby={`help-${g.id}`}>
            <h2 id={`help-${g.id}`}>{g.title}</h2>
            <div className="help-faqs">
              {g.items.map((f) => (
                <details key={f.q} className="help-faq">
                  <summary>{f.q}</summary>
                  <div className="help-answer">
                    <p>{f.a}</p>
                    {f.cta ? (
                      f.cta.href.startsWith('mailto:') ? (
                        <a className="help-cta" href={f.cta.href}>{f.cta.label}</a>
                      ) : (
                        <Link className="help-cta" href={f.cta.href}>{f.cta.label}</Link>
                      )
                    ) : null}
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))
      )}

      <div className="card help-contact">
        <h2>Still need a hand?</h2>
        <p className="muted">
          {OPERATOR} builds and supports ChMS. Write to us with a question, a bug or an idea — we read every message.
        </p>
        <div className="help-quick">
          <a className="pub-btn small" href={`mailto:${CONTACT_EMAIL}?subject=ChMS%20support`}>Email {CONTACT_EMAIL}</a>
          <Link href="/terms" className="pub-btn ghost small">Terms of Use</Link>
          <Link href="/privacy" className="pub-btn ghost small">Privacy Policy</Link>
        </div>
      </div>
    </div>
  );
}