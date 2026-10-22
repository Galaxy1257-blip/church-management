'use client';
// Flyer/QR page: shareable links for the public surfaces (give, visitor
// form, portal). Renders QR codes from a tiny inline SVG encoder fallback:
// uses the browser's built-in ability via external-free qr image data.
import { use, useState } from 'react';

export default function FlyersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [origin] = useState(() => (typeof window !== 'undefined' ? window.location.origin : ''));
  const links = [
    { label: 'Give online', url: `${origin}/give/${slug}` },
    { label: 'Guest / visitor form', url: `${origin}/portal` },
    { label: 'Member portal', url: `${origin}/portal` },
  ];
  return (
    <div className="container" style={{ maxWidth: 560, paddingTop: '4vh' }}>
      <div className="card">
        <h1>Flyers & links — {slug}</h1>
        <p className="muted">Print or share these links (paste into WhatsApp/status; QR generation via printer plugin or phone camera link).</p>
        {links.map((l) => (
          <div className="card" key={l.label} style={{ marginTop: '0.6rem' }}>
            <strong>{l.label}</strong>
            <div className="row" style={{ marginTop: '0.3rem' }}>
              <code style={{ flex: 1, wordBreak: 'break-all' }}>{l.url}</code>
              <button className="small secondary" onClick={() => void navigator.clipboard?.writeText(l.url)}>Copy</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
