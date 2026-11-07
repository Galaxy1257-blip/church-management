import type { Metadata } from 'next';
import Link from 'next/link';
import { APP_NAME, CONTACT_EMAIL, LEGAL_UPDATED, OPERATOR, PROCESSORS } from '../legal-meta';

export const metadata: Metadata = {
  title: `Privacy Policy · ${APP_NAME}`,
  description: 'What ChMS stores about you, why, who sees it, and how to have it deleted.',
};

export default function PrivacyPage() {
  return (
    <div className="pub-inner pub-section legal">
      <p className="eyebrow">Legal</p>
      <h1>Privacy Policy</h1>
      <p className="legal-updated">Last updated {LEGAL_UPDATED}</p>

      <p>
        {OPERATOR} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) builds and hosts {APP_NAME}. The church that signs up decides what
        is recorded about its members; we process it on the church&rsquo;s behalf. This policy explains what is stored,
        why, who can see it, and how you can have it corrected or deleted. It applies to the website, the member
        portal and the staff app.
      </p>

      <h2>1. What we store</h2>
      <ul>
        <li>
          <b>Church account:</b> church name, its ID in web addresses, contact details, branding, and which app sections
          are switched on.
        </li>
        <li>
          <b>Staff accounts:</b> name, phone number, email (if given), a hashed password, roles and branch assignments,
          and last sign-in time. We never store your password in readable form.
        </li>
        <li>
          <b>Member register:</b> name, member number, phone, email, gender, date of birth or age group, address,
          optional photo, join date and spiritual milestones (salvation, baptism, marriage, ordination) where the
          church records them.
        </li>
        <li>
          <b>Children and guardians:</b> a child&rsquo;s name and age group, check-in and pick-up times, and the names
          and contacts of the adults allowed to collect them. Allergies or care notes are stored only where the church
          enters them, and are shown only to the class teacher and the children&rsquo;s desk.
        </li>
        <li>
          <b>Attendance:</b> service headcounts, check-in records and group meeting attendance.
        </li>
        <li>
          <b>Money:</b> offerings, pledges, expenses and welfare requests — amounts, dates, category, payment channel
          and reference. For online gifts we store the payment provider&rsquo;s reference and status, <b>not</b> your
          card number or mobile-money PIN. A giver&rsquo;s name and phone are kept with the gift unless the giver chose
          to give anonymously.
        </li>
        <li>
          <b>Care:</b> prayer requests, welfare requests and counselling notes. Counselling notes and private prayer
          requests are encrypted before they are written to the database.
        </li>
        <li>
          <b>Messages:</b> a log of each text (recipient, content, delivery status), your consent or opt-out choice, and
          any reply you send to the church&rsquo;s number.
        </li>
        <li>
          <b>Celebrations:</b> a leader may mark a birthday or anniversary on the Programs screen to share with the
          congregation. Nothing is shared until a leader approves it. The notice names you and the day, and may say
          how many years it has been (for example, &ldquo;Ama&rsquo;s 30th birthday&rdquo;).
        </li>
        <li>
          <b>Device and session:</b> a sign-in token kept in your browser (only in local storage if you tick
          &ldquo;keep me signed in&rdquo;), push-notification subscription details if you allow notifications, and your
          chosen theme and dashboard layout. We do not use advertising cookies or third-party trackers.
        </li>
        <li>
          <b>Audit log:</b> who changed which record and when, so the church can answer for its own books.
        </li>
      </ul>

      <h2>2. Why we store it</h2>
      <ul>
        <li>To run the church&rsquo;s register, attendance, giving and care — the service the church pays for.</li>
        <li>To sign you in and keep your session secure.</li>
        <li>To send the messages the church asks for, and to respect opt-outs.</li>
        <li>To take subscription payments and keep accounting records the law requires.</li>
        <li>To investigate faults and misuse, using the audit log.</li>
      </ul>
      <p>
        We do not sell personal data, we do not use it for advertising, and we do not use member or counselling content
        to train any model.
      </p>

      <h2>3. Who can see it</h2>
      <ul>
        <li>
          <b>Inside the church:</b> only the roles the church assigns. A teacher sees their own class; an usher sees the
          door register; finance sees the books. Each church&rsquo;s records are separated from every other
          church&rsquo;s at the database level.
        </li>
        <li>
          <b>Our processors:</b> the companies that host and move the data for us — the database host ({PROCESSORS.database}),
          the API host ({PROCESSORS.api}), the web host ({PROCESSORS.web}), the payment provider ({PROCESSORS.payments}) and
          {PROCESSORS.sms}. They process data only to provide their service to us.
        </li>
        <li>
          <b>By law:</b> we may disclose records where a court or a law lawfully requires it, and we will tell the church
          where we are allowed to.
        </li>
      </ul>
      <p>
        Some processors operate outside Ghana. Where they do, we rely on their contractual commitments to protect the
        data to a standard equivalent to Ghana&rsquo;s Data Protection Act, 2012 (Act 843).
      </p>

      <h2>4. How long we keep it</h2>
      <ul>
        <li>Member, attendance and care records: while the church&rsquo;s account is active, then deleted after the export window on cancellation.</li>
        <li>
          Giving and expense records: as long as accounting and tax law requires (normally six years), because the
          church must be able to answer for its books. When a person is deleted, their name and phone are removed from
          these records but the amounts remain.
        </li>
        <li>Message logs and the audit log: six years, for the same accounting and accountability reason.</li>
        <li>Sign-in tokens: until they expire or you sign out; refresh tokens are revoked on sign-out and on deletion.</li>
        <li>Backups: rolling copies kept by the database host for disaster recovery, overwritten on their schedule.</li>
      </ul>

      <h2>5. Your choices and rights</h2>
      <ul>
        <li>
          <b>See and correct:</b> in the member portal you can see your own profile and giving history. Ask the church
          office to correct anything wrong, or write to us.
        </li>
        <li>
          <b>Take a copy:</b> the portal gives your giving statement as a PDF; the church can export registers and
          reports as PDF or CSV.
        </li>
        <li>
          <b>Delete yourself:</b> in the member portal (or the About page for staff) choose <b>Delete my account and
          data</b>. We remove your name, contact details, photo, date of birth, care notes and prayer requests, revoke
          your sessions and stop all messages to you. Amounts in the church&rsquo;s books stay, without your name, for
          as long as the law requires. You can also ask the church office or email us and we will do the same.
        </li>
        <li>
          <b>Stop texts:</b> reply STOP to any message, or turn off messages on your profile. We record the opt-out and
          the church must not message you again until you opt back in.
        </li>
        <li>
          <b>Notifications:</b> turn them off in your browser or device settings at any time.
        </li>
        <li>
          <b>Complain:</b> write to us first; you may also complain to the Data Protection Commission of Ghana.
        </li>
      </ul>
      <p>
        We answer rights requests within 30 days. We may need to confirm who you are before acting, and we will tell you
        if a law prevents us from deleting something.
      </p>

      <h2>6. Children</h2>
      <p>
        The children&rsquo;s desk stores only what a parent or the church enters for check-in and pick-up safety. A
        parent or guardian can ask the church office, or us, to see, correct or delete their child&rsquo;s record at any
        time. We do not ask children for accounts and we do not send messages to children.
      </p>

      <h2>7. Security</h2>
      <p>
        Traffic is encrypted in transit (HTTPS). Passwords are hashed. Counselling notes and private prayer requests are
        encrypted at rest. Each church&rsquo;s rows are protected by database row-level security, and every action checks
        the signed-in person&rsquo;s role. No system is perfect; if a breach affects your data we will tell the church and
        affected people without undue delay and notify the regulator where the law requires.
      </p>

      <h2>8. Changes to this policy</h2>
      <p>
        When the app gains a feature that changes what is stored, this policy is updated in the same release and the
        date above changes. For a material change we show a notice in the app or email the church office before it
        takes effect.
      </p>

      <h2>9. Contact</h2>
      <p>
        {OPERATOR} · <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. A real person answers.
      </p>

      <p className="legal-links">
        See also the <Link href="/terms">Terms of Use</Link>.
      </p>
    </div>
  );
}