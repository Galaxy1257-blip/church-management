'use client';
// About: who builds ChMS and how to reach them. Ungated — every signed-in
// staff member can open it from the sidebar footer.
import { useEffect, useState } from 'react';
import { getSession } from '../../../lib/session';

const DEVELOPER = 'OmniLabs Studios Pty';
const EMAIL = 'app.omnilabs.dev@gmail.com';

export default function AboutPage() {
  const [church, setChurch] = useState('');

  useEffect(() => {
    void getSession().then((m) => setChurch(m.church.name)).catch(() => undefined);
  }, []);

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
          </tbody>
        </table>
        <div className="row" style={{ marginTop: '0.8rem' }}>
          <a className="badge mute" href={`mailto:${EMAIL}?subject=ChMS%20support`}>
            Email support
          </a>
        </div>
      </div>
    </div>
  );
}
