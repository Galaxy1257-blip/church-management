'use client';
// The church's join QR: a member scans it at the door, types the code once, and
// is added. Useful to the office and to whoever is on the door that Sunday.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../../../lib/api';
import { logoToJpeg } from '../../../lib/pdf';
import type { PdfDoc } from '../../../lib/pdf';
import { sharePdf } from '../../../lib/share';
import { peekSession } from '../../../lib/session';
import Notice from '../../../components/notice';

interface JoinLink { enabled: boolean; code: string; slug: string; name: string }

/** One A4 card for the door table: the church's name, the code, and a scannable QR. */
function cardDoc(data: JoinLink, qrJpeg: string | null): PdfDoc {
  return {
    title: 'New here? Join the list',
    subtitle: `${data.name} · scan, type the code once, and you are on the church book`,
    blocks: [
      {
        kind: 'text',
        text: 'Give this card to someone new. They point their camera at the square, type the code below once, and their name reaches the church list. No form for anyone at the desk to fill.',
      },
      ...(qrJpeg
        ? [{ kind: 'image' as const, jpeg: qrJpeg, maxSide: 320, caption: 'Point your camera here', spaceBefore: 18 }]
        : [{ kind: 'text' as const, text: 'The square could not be prepared on this device. Use the code below instead.', spaceBefore: 18 }]),
      { kind: 'rule', spaceBefore: 20 },
      {
        kind: 'fields',
        rows: [
          { label: 'Church code', value: data.code, bold: true },
          { label: 'Or open', value: `${typeof window === 'undefined' ? '' : window.location.origin}/join/${data.slug}` },
        ],
        spaceBefore: 12,
      },
    ],
    footnote: 'This code belongs to one church only. A card from another church will not add anyone to this list.',
  };
}

export default function JoinCardPage() {
  const [data, setData] = useState<JoinLink | null>(null);
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

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

  /** The same card on paper, for the table at the door. */
  async function printCard(): Promise<void> {
    if (!data) return;
    setBusy(true);
    setError('');
    try {
      const jpeg = qr ? await logoToJpeg(qr, 640) : null;
      const result = await sharePdf({
        church: peekSession()?.church,
        doc: cardDoc(data, jpeg),
        filename: `join-card-${data.slug}.pdf`,
        title: `Join ${data.name}`,
        text: `Church code ${data.code}`,
      });
      if (result.kind === 'failed') setError(result.message);
      else if (result.message) setNotice(result.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not prepare the card');
    } finally {
      setBusy(false);
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
            <button className="small secondary" onClick={() => void printCard()} disabled={busy}>{busy ? 'Preparing...' : 'Print the card'}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
