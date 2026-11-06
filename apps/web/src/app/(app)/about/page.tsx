'use client';
// About: who builds ChMS and how to reach them. Ungated — every signed-in
// staff member can open it from the sidebar footer. Also the staff side of the
// erasure right: a person can delete their own account here, not only in the
// member portal.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, clearTokens } from '../../../lib/api';
import { clearSession, getSession } from '../../../lib/session';
import Notice from '../../../components/notice';

const DEVELOPER = 'OmniLabs Studios Pty';
const EMAIL = 'app.omnilabs.dev@gmail.com';

export default function AboutPage() {
  const [church, setChurch] = useState('');
  const [confirmErase, setConfirmErase] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    void getSession().then((m) => setChurch(m.church.name)).catch(() => undefined);
  }, []);

  async function eraseAccount(): Promise<void> {
    setErasing(true);
    try {
      await api('/auth/me', { method: 'DELETE' });
      clearTokens();
      clearSession();
      router.replace('/login');
    } catch {
      setError(`Could not delete your account. Write to ${EMAIL} and we will do it for you.`);
      setConfirmErase(false);
    } finally {
      setErasing(false);
    }
  }

  return (
    <div>
      <h1>About</h1>
      <div className="card">
        <h2>Church Management System</h2>
        <p className="muted">
          One place for members, attendance, offerings, care and messages{church ? `, made for ${church}` : ''}.
          It works on a phone in the pew or a desk in the office.
        </p>
        <table>
          <tbody>
            <tr>
              <th style={{ width: 170 }}>Built by</th>
              <td>{DEVELOPER}</td>
            </tr>
            <tr>
              <th>Email</th>
              <td>
                <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
              </td>
            </tr>
            <tr>
              <th>Support</th>
              <td>Write to us with a question, a bug or an idea — we read every message.</td>
            </tr>
            <tr>
              <th>Legal</th>
              <td>
                <Link href="/terms">Terms of Use</Link> · <Link href="/privacy">Privacy Policy</Link>
              </td>
            </tr>
          </tbody>
        </table>
        <div className="row" style={{ marginTop: '0.8rem' }}>
          <a className="badge mute" href={`mailto:${EMAIL}?subject=ChMS%20support`}>
            Email support
          </a>
        </div>
      </div>

      <div className="card">
        <h2>My account</h2>
        <p className="muted">
          Deleting your account removes your name, phone, email and password, revokes your sessions and takes away
          your roles. Records the church must keep for its books (amounts, the audit trail) stay without your name.
          This cannot be undone. <Link href="/privacy">What is deleted and what is kept</Link>.
        </p>
        {error ? <Notice kind="error" text={error} onDone={() => setError('')} /> : null}
        {confirmErase ? (
          <div className="row">
            <button type="button" className="danger" disabled={erasing} onClick={() => void eraseAccount()}>
              {erasing ? 'Deleting…' : 'Yes, delete my account and data'}
            </button>
            <button type="button" className="secondary" disabled={erasing} onClick={() => setConfirmErase(false)}>
              Keep my account
            </button>
          </div>
        ) : (
          <button type="button" className="secondary" onClick={() => setConfirmErase(true)}>
            Delete my account and data
          </button>
        )}
      </div>
    </div>
  );
}