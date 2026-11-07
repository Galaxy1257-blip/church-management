import type { Metadata } from 'next';
import Link from 'next/link';
import { APP_NAME, CONTACT_EMAIL, LEGAL_UPDATED, OPERATOR } from '../legal-meta';

export const metadata: Metadata = {
  title: `Terms of Use · ${APP_NAME}`,
  description: 'The agreement between your church and the people who use ChMS.',
};

export default function TermsPage() {
  return (
    <div className="pub-inner pub-section legal">
      <p className="eyebrow">Legal</p>
      <h1>Terms of Use</h1>
      <p className="legal-updated">Last updated {LEGAL_UPDATED}</p>

      <p>
        These terms are the agreement between <b>{OPERATOR}</b> (&ldquo;we&rdquo;, &ldquo;us&rdquo;), the church that
        signs up (&ldquo;the church&rdquo;), and every person who signs in to {APP_NAME} (&ldquo;you&rdquo;). By creating
        an account or signing in, you accept them. If you do not accept them, do not use the app.
      </p>

      <h2>1. What the app is</h2>
      <p>
        {APP_NAME} is a church management tool: a member register, attendance and check-in, offerings and expenses,
        care and prayer requests, groups, announcements and text messages. It is software for running a church&rsquo;s
        own records. It is not a bank, a payment provider, a medical service or a law firm.
      </p>

      <h2>2. Who is responsible for what</h2>
      <ul>
        <li>
          <b>The church owns its records.</b> Members, giving, attendance and care notes belong to the church. We host
          and process them on the church&rsquo;s instructions and do not sell them or use them for advertising.
        </li>
        <li>
          <b>The church is responsible for its people&rsquo;s data.</b> Before adding a member, a child or a guardian,
          the church must have a lawful reason and the person&rsquo;s (or a parent&rsquo;s) consent, and must tell them
          what is stored. The church must honour requests to correct or delete a person&rsquo;s record.
        </li>
        <li>
          <b>The church is responsible for its messages.</b> Texts and announcements may only be sent to people who
          agreed to receive them. Anyone can opt out by replying STOP; the church must not re-add them. Celebration
          notices (birthdays, anniversaries) count as announcements: a leader must approve each one before the
          congregation sees it, and anyone can ask the office not to share theirs.
        </li>
        <li>
          <b>You are responsible for your sign-in.</b> Keep your password and one-time codes private. Tell the church
          office at once if you think someone else used your account.
        </li>
      </ul>

      <h2>3. Acceptable use</h2>
      <p>You must not use {APP_NAME} to:</p>
      <ul>
        <li>break any law, or store or send content that is unlawful, threatening or harassing;</li>
        <li>send bulk messages to people who did not consent, or ignore an opt-out;</li>
        <li>upload someone else&rsquo;s personal data without a lawful reason;</li>
        <li>try to reach another church&rsquo;s records, defeat a permission, or probe the service without written permission;</li>
        <li>resell, copy or scrape the service, or use it to build a competing product.</li>
      </ul>
      <p>We may suspend an account that breaks these rules, and will tell the church office why where we can.</p>

      <h2>4. Care and counselling notes</h2>
      <p>
        Prayer requests, welfare requests and counselling notes are pastoral records kept by the church. They are
        encrypted at rest and visible only to the roles the church allows. They are <b>not</b> medical, psychological
        or legal advice, and they are not a substitute for a professional. In an emergency, contact the emergency
        services, not the app.
      </p>

      <h2>5. Money</h2>
      <ul>
        <li>
          <b>Subscription.</b> A new church gets 14 days free with no card. After the trial the price shown at sign-up
          (currently GH&#8373; 100 a month for the whole church) applies. We may change the price with at least 30
          days&rsquo; notice; the new price starts at your next renewal.
        </li>
        <li>
          <b>Payment.</b> You can pay by mobile money, card or cash through an onboarding agent. Card and mobile-money
          details are handled by the payment provider (Paystack); we never see or store your full card number.
        </li>
        <li>
          <b>Offerings recorded in the app.</b> Amounts entered by hand are the church&rsquo;s own record. Online gifts
          are settled by the payment provider; the app shows what the provider reports. We are not a party to the gift
          between a giver and the church.
        </li>
        <li>
          <b>If payment fails.</b> After the grace period shown in the app, the church&rsquo;s workspace is locked until
          payment is received. Records are kept, not deleted, during a lock.
        </li>
        <li>
          <b>Refunds.</b> Subscription fees already paid for a period in use are not refundable, except where the law
          says otherwise. If we stop the service permanently, we refund any unused whole months.
        </li>
      </ul>

      <h2>6. Availability</h2>
      <p>
        We work to keep the app available and to fix faults quickly, but we do not promise uninterrupted service.
        Maintenance, hosting-provider outages and phone networks can interrupt it. Keep your own copies of anything
        you cannot afford to lose: the app can export statements and reports as PDF and CSV.
      </p>

      <h2>7. Ending the agreement</h2>
      <ul>
        <li>The church can cancel at any time from Settings or by writing to us; access continues to the end of the paid period.</li>
        <li>
          Any person can delete their own account and personal data from inside the app (member portal or About page),
          or ask the church office or us to do it. What is deleted and what the law makes us keep is set out in the{' '}
          <Link href="/privacy">Privacy Policy</Link>.
        </li>
        <li>
          On cancellation we give the church a reasonable window (at least 30 days) to export its records, then delete
          them, except records the law requires us to keep.
        </li>
      </ul>

      <h2>8. Liability</h2>
      <p>
        To the fullest extent the law allows, we are not liable for indirect or consequential loss, lost offerings,
        lost data caused by your own actions, or decisions made on the basis of app records. Our total liability for
        any claim is limited to the subscription fees the church paid in the six months before the claim. Nothing in
        these terms limits liability that cannot lawfully be limited, including for fraud or for death or personal
        injury caused by negligence.
      </p>

      <h2>9. Changes to these terms</h2>
      <p>
        We may update these terms as the app changes. The date at the top always shows the current version. For a
        material change we will show a notice in the app or email the church office before it takes effect. Continuing
        to use the app after a change means you accept it.
      </p>

      <h2>10. Law and disputes</h2>
      <p>
        These terms are governed by the laws of the Republic of Ghana. Before going to court, write to us at{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and give us 30 days to resolve the problem. The courts
        of Ghana have jurisdiction over anything that remains.
      </p>

      <p className="legal-links">
        See also the <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </div>
  );
}