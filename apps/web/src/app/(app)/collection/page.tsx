'use client';
// What an usher may do with money: say how much the offering came to. The
// treasurer approves it on the finance page; nothing here shows the sheet.
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { toPesewas } from '../../../lib/format';
import Notice from '../../../components/notice';

interface ServiceOption { id: string; name: string; startsAt: string }

export default function CollectionPage() {
  const [services, setServices] = useState<ServiceOption[]>([]);
  // '' = nothing chosen yet, 'other' = a program that is not a service.
  const [target, setTarget] = useState('other');
  const [program, setProgram] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Its own endpoint: counting the offering must not need the Services section
    // switched on, and a program that is not a service is a valid occasion too.
    void api<{ currentId: string | null; services: ServiceOption[] }>('/finance/collection-service')
      .then((c) => {
        setServices(c.services);
        setTarget(c.currentId ?? 'other');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'could not find the service'));
  }, []);

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    const amountMinor = toPesewas(amount);
    if (amountMinor === null || amountMinor <= 0) {
      setError('Write the amount you counted, like 350 or 350.50.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/finance/collection', {
        method: 'POST',
        body: {
          ...(target === 'other' ? { label: program } : { serviceId: target }),
          amountMinor,
          note: note || undefined,
        },
      });
      setAmount(''); setNote('');
      setNotice('Counted in. The treasurer will approve it.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not record the count');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1>Collection count</h1>
      <p className="muted">Enter the offering you counted after the service. It goes to the treasurer for approval — this does not open the finance sheet.</p>
      {notice ? <Notice text={notice} onDone={() => setNotice('')} /> : null}
      {error ? <Notice kind="error" text={error} onDone={() => setError('')} /> : null}
      <div className="card">
        <form className="stack" onSubmit={submit}>
          <label>
            For what?
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
              <option value="other">Other program…</option>
            </select>
          </label>
          {target === 'other' ? (
            <label>
              Program name
              <input value={program} onChange={(e) => setProgram(e.target.value)} placeholder="Harvest night, funeral, building fund drive" required />
            </label>
          ) : null}
          <label>Amount counted (GHS)<input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="350" required /></label>
          <label>Note (optional)<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="two ushers counted together, after the service" /></label>
          <button disabled={busy || (target === 'other' ? program.trim().length < 3 : !target)}>Submit count</button>
        </form>
      </div>
    </div>
  );
}
