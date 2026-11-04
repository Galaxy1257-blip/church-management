'use client';
// The church's join QR: a member scans it at the door, types the code once, and
// is added. Useful to the office and to whoever is on the door that Sunday.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../../../lib/api';
import Notice from '../../../components/notice';

interface JoinLink { enabled: boolean; code: string; slug: string; name: string }

export default function JoinCardPage() {
  const [data, setData] = useState<JoinLink | null>(null);
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    void api<JoinLink>('/churches/me/join-link')
      .then(async (d) => {
        setData(d);
        if (d.enabled && d.slug) {
          const url = `${window.location.origin}/join/${d.slug}`;
          setQr(await QRCode.toDataURL(url, { width: 320, margin: 1, color: { dark: '#1f2a24', light: '#fffdf8' } }));
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'could not load the join code'));
  }, []);

  async function share(): Promise<void> {
    if (!data) return;
    const url = `${window.location.origin}/join/${data.slug}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `Join ${data.name}`, text: `Church code: ${data.code}`, url });
      } else {
        await navigator.clipboard.writeText(`${data.name}: ${url} (code ${data.code})`);
        setNotice('Link and code copied — paste them in WhatsApp.');
      }
    } catch {
      // The person closed the share sheet; nothing to do.
    }
  }

  return (
    <div>
      <h1>Add a member</h1>
      <p className="muted">
        Show this to someone new at the door. They scan it with their phone camera, type the code once, and they are on
        the church list — no forms for you to fill.
      </p>
      {notice ? <Notice text={notice} onDone={() => setNotice('')} /> : null}
      {error ? <Notice kind="error" text={error} onDone={() => setError('')} /> : null}
      {data && !data.enabled ? (
        <div className="card">
          <p className="muted" style={{ marginBottom: 0 }}>
            Self add is switched off. Turn it on in Settings → App sections → <b>Members adding themselves</b>.
          </p>
        </div>
      ) : null}
      {data?.enabled ? (
        <div className="card" style={{ textAlign: 'center' }}>
          <h2>{data.name}</h2>
          {qr ? <img src={qr} alt="QR code to join this church" style={{ width: '100%', maxWidth: 320, borderRadius: 8 }} /> : null}
          <p className="muted" style={{ margin: '8px 0 0' }}>Church code</p>
          <div style={{ fontFamily: 'monospace', fontSize: '1.6rem', letterSpacing: '0.12em' }}>{data.code}</div>
          <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
            <button className="small secondary" onClick={() => void share()}>Share the link</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
