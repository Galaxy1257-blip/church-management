'use client';
// Service detail: offline-first headcount (outbox) + live totals.
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../../../lib/api';
import { fmtDateTime } from '../../../../lib/format';
import { clientUuid, outboxEnqueue, outboxFlush, outboxPending } from '../../../../lib/outbox';

interface Segment {
  segmentKey: string;
  label: string;
  net: number;
}

interface ServiceInfo {
  id: string;
  name: string;
  startsAt: string;
  status: string;
}

export default function ServiceDetailPage() {
  const params = useParams<{ id: string }>();
  const serviceId = params.id;
  const [service, setService] = useState<ServiceInfo | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [netTotal, setNetTotal] = useState(0);
  const [pending, setPending] = useState(0);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [capacity, setCapacity] = useState(0);
  const seqRef = useRef(0);

  const refreshTotals = useCallback(async () => {
    try {
      const res = await api<{ totals: Segment[]; netTotal: number }>(
        `/headcount/totals?serviceId=${serviceId}`,
      );
      setSegments(res.totals);
      setNetTotal(res.netTotal);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load totals');
    }
  }, [serviceId]);

  const tryFlush = useCallback(async () => {
    try {
      const res = await outboxFlush((path, body) => api(path, { method: 'POST', body }));
      setPending(res.pending);
      if (res.synced > 0) await refreshTotals();
    } catch {
      /* offline or server down — outbox keeps events; will retry */
    }
  }, [refreshTotals]);

  useEffect(() => {
    void api<ServiceInfo>(`/services/${serviceId}`).then(setService).catch(() => undefined);
    void refreshTotals();
    void api<{ capacity: number }>('/demographics/settings').then((s) => setCapacity(s.capacity ?? 0)).catch(() => undefined);
    void outboxPending().then((p) => setPending(p.length));
    const onOnline = (): void => {
      setOffline(false);
      void tryFlush();
    };
    const onOffline = (): void => setOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    setOffline(!navigator.onLine);
    const timer = setInterval(() => void tryFlush(), 15_000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(timer);
    };
  }, [serviceId, refreshTotals, tryFlush]);

  async function tap(segmentKey: string, delta: 1 | -1): Promise<void> {
    // Optimistic local echo, then enqueue; server totals win on next refresh.
    const nextTotal = netTotal + delta;
    setSegments((prev) =>
      prev.map((s) => (s.segmentKey === segmentKey ? { ...s, net: s.net + delta } : s)),
    );
    setNetTotal(nextTotal);
    // Haptic feedback; strong patterns at 85%/95% capacity (features doc).
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      if (capacity > 0 && nextTotal / capacity >= 0.95) navigator.vibrate([200, 80, 200]);
      else if (capacity > 0 && nextTotal / capacity >= 0.85) navigator.vibrate(120);
      else navigator.vibrate(12);
    }
    seqRef.current += 1;
    await outboxEnqueue({
      id: clientUuid(),
      serviceId,
      segmentKey,
      delta,
      clientSeq: seqRef.current,
      recordedAt: new Date().toISOString(),
    });
    void outboxPending().then((p) => setPending(p.length));
    await tryFlush();
  }

  /**
   * Direct number entry: typing "40" sets the segment to 40 by queueing the
   * same ±1 outbox events repeated taps would create (offline-safe, idempotent).
   */
  async function setCount(segmentKey: string, target: number): Promise<void> {
    const current = segments.find((s) => s.segmentKey === segmentKey)?.net ?? 0;
    const wanted = Math.max(0, Math.min(999, Math.floor(target)));
    const diff = wanted - current;
    if (!diff) return;
    const step: 1 | -1 = diff > 0 ? 1 : -1;
    const times = Math.abs(diff);
    setSegments((prev) => prev.map((s) => (s.segmentKey === segmentKey ? { ...s, net: wanted } : s)));
    setNetTotal((t) => t + diff);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(12);
    for (let i = 0; i < times; i++) {
      seqRef.current += 1;
      await outboxEnqueue({
        id: clientUuid(),
        serviceId,
        segmentKey,
        delta: step,
        clientSeq: seqRef.current,
        recordedAt: new Date().toISOString(),
      });
    }
    void outboxPending().then((p) => setPending(p.length));
    await tryFlush();
  }

  function commitDraft(segmentKey: string): void {
    const raw = draft[segmentKey];
    if (raw === undefined) return;
    setDraft((d) => {
      const n = { ...d };
      delete n[segmentKey];
      return n;
    });
    if (raw !== '') void setCount(segmentKey, Number(raw));
  }

  if (!service) return <div>Loading service…</div>;

  return (
    <div>
      <div className="spread">
        <h1>{service.name}</h1>
        <span className={`badge ${service.status === 'OPEN' ? 'ok' : service.status === 'CLOSED' ? 'err' : 'warn'}`}>
          {service.status}
        </span>
      </div>
      <p className="muted">{fmtDateTime(service.startsAt)}</p>
      {error ? <div className="error">{error}</div> : null}

      {capacity > 0 && netTotal / capacity >= 0.85 ? (
        <div
          className="card"
          style={{
            borderColor: netTotal / capacity >= 0.95 ? 'var(--danger)' : 'var(--warn)',
            background: netTotal / capacity >= 0.95 ? '#f9e3e0' : '#faf0d9',
            fontWeight: 700,
            textAlign: 'center',
          }}
        >
          {netTotal / capacity >= 0.95
            ? `🔴 OVERFLOW RISK — ${netTotal}/${capacity} seats (${Math.round((netTotal / capacity) * 100)}%). Open overflow areas now.`
            : `🟡 Approaching capacity — ${netTotal}/${capacity} seats (${Math.round((netTotal / capacity) * 100)}%).`}
        </div>
      ) : null}

      <div className="card">
        <div className="spread">
          <h2 style={{ margin: 0 }}>Attendance count</h2>
          <div className="row">
            <span className={`badge ${offline ? 'warn' : 'ok'}`}>{offline ? 'OFFLINE — counting' : 'online'}</span>
            <span className="badge mute">{pending} unsynced</span>
            <button className="small secondary" onClick={() => void tryFlush()}>
              Sync now
            </button>
          </div>
        </div>
        <p className="muted">
          Tap +/− or <strong>type a number directly</strong> (then press Enter). Every change is saved on this
          phone and sent when you have network again — airplane mode is safe.
        </p>
        <div style={{ marginTop: '0.5rem' }}>
          {segments.map((s) => (
            <div className="counter" key={s.segmentKey}>
              <span className="name">{s.label}</span>
              <button className="secondary" aria-label={`minus ${s.label}`} onClick={() => void tap(s.segmentKey, -1)}>
                −
              </button>
              <input
                className="count"
                inputMode="numeric"
                value={draft[s.segmentKey] ?? String(s.net)}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [s.segmentKey]: e.target.value.replace(/[^0-9]/g, '').slice(0, 3) }))
                }
                onBlur={() => commitDraft(s.segmentKey)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                onFocus={(e) => e.currentTarget.select()}
                aria-label={`${s.label} count — type a number and press Enter`}
                title="Type a number and press Enter"
              />
              <button aria-label={`plus ${s.label}`} onClick={() => void tap(s.segmentKey, 1)}>
                +
              </button>
            </div>
          ))}
        </div>
        <div className="spread" style={{ marginTop: '0.8rem' }}>
          <strong>Total</strong>
          <strong style={{ fontSize: '1.5rem' }}>{netTotal}</strong>
        </div>
      </div>
    </div>
  );
}
