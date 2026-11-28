'use client';
// One message bar for the whole app. It clears itself — a "Saved" banner that
// stays on screen forever is indistinguishable from a new one, and on a phone it
// pushes the page down long after the action is done. Errors get longer, and a
// close button, because a person may still be reading them.
import { useEffect } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function Notice({
  text,
  kind = 'ok',
  onDone,
}: {
  text: string;
  kind?: 'ok' | 'error';
  onDone: () => void;
}) {
  useEffect(() => {
    if (!text) return;
    const id = setTimeout(onDone, kind === 'error' ? 12_000 : 6_000);
    return () => clearTimeout(id);
  }, [text, kind, onDone]);

  if (!text) return null;
  if (kind === 'error') {
    return (
      <div className="error notice-banner" role="alert" style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <AlertTriangle size={18} style={{ flex: 'none', marginTop: 2 }} aria-hidden="true" />
        <span style={{ flex: 1 }}>{text}</span>
        <button type="button" className="link-button" onClick={onDone} aria-label="Dismiss">×</button>
      </div>
    );
  }
  return (
    <div className="card notice-banner" style={{ borderColor: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 8 }} role="status">
      <CheckCircle2 size={18} style={{ flex: 'none', color: 'var(--badge-ok-ink)' }} aria-hidden="true" />
      {text}
    </div>
  );
}
