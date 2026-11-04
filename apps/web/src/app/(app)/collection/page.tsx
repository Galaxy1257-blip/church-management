'use client';
// What an usher may do with money: say how much the offering came to. The
// treasurer approves it on the finance page; nothing here shows the sheet.
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { toPesewas } from '../../../lib/format';
import Notice from '../../../components/notice';

interface Service { id: string; name: string; startsAt: string; status: string }

export default function CollectionPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [serviceId, setServiceId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<Service[]>('/services')
      .then((list) => {
        setServices(list);
        const active = list.find((s) => s.status === 'OPEN') ?? list[0];
        if (active) setServiceId(active.id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'could not load services'));
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
      await api('/finance/collection', { method: 'POST', body: { serviceId, amountMinor, note: note || undefined } });
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
            Service
            <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} required>
              <option value="">Choose the service</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label>Amount counted (GHS)<input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="350" required /></label>
          <label>Note (optional)<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="two ushers counted together, after the service" /></label>
          <button disabled={busy || !serviceId}>Submit count</button>
        </form>
      </div>
    </div>
  );
}
