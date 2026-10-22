'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { fmtDateTime } from '../../../lib/format';

interface Wallet {
  balanceUnits: number;
  reservedUnits: number;
}

interface Campaign {
  id: string;
  name: string;
  body: string;
  status: string;
  totalRecipients: number;
  createdAt: string;
}

interface SmsLogRow {
  id: string;
  toE164: string;
  body: string;
  segments: number;
  status: string;
  source: string;
  queuedAt: string;
}

interface Preview {
  recipients: number;
  segments: number;
  totalUnits: number;
}

interface OptOut {
  phoneE164: string;
  createdAt: string;
}

export default function SmsPage() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [logs, setLogs] = useState<SmsLogRow[]>([]);
  const [optOuts, setOptOuts] = useState<OptOut[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ name: '', body: '', includeVisitors: false });
  const [preview, setPreview] = useState<Preview | null>(null);

  const load = useCallback(async () => {
    try {
      const [w, c, l, o] = await Promise.all([
        api<Wallet>('/sms/wallet'),
        api<Campaign[]>('/sms/campaigns'),
        api<SmsLogRow[]>('/sms/logs?limit=30'),
        api<OptOut[]>('/sms/opt-outs'),
      ]);
      setWallet(w);
      setCampaigns(c);
      setLogs(l);
      setOptOuts(o);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function doPreview(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      setPreview(
        await api<Preview>('/sms/campaigns/preview', {
          method: 'POST',
          body: { body: form.body, audience: { includeVisitors: form.includeVisitors } },
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'preview failed');
    }
  }

  async function sendCampaign(): Promise<void> {
    try {
      const campaign = await api<Campaign>('/sms/campaigns', {
        method: 'POST',
        body: {
          name: form.name || 'Broadcast',
          body: form.body,
          audience: { includeVisitors: form.includeVisitors },
        },
      });
      const res = await api<{ queued: number }>(`/sms/campaigns/${campaign.id}/send`, { method: 'POST' });
      setNotice(`Queued ${res.queued} message(s)`);
      setForm({ name: '', body: '', includeVisitors: false });
      setPreview(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'send failed');
    }
  }

  async function removeOptOut(phone: string): Promise<void> {
    try {
      await api(`/sms/opt-outs/${encodeURIComponent(phone)}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed');
    }
  }
  return (
    <div>
      <div className="spread">
        <h1>SMS</h1>
        {wallet ? (
          <div className="row">
            <span className="badge ok">{wallet.balanceUnits} credits</span>
            <span className="badge mute">reserved {wallet.reservedUnits}</span>
          </div>
        ) : null}
      </div>
      {notice ? <div className="card" style={{ borderColor: 'var(--accent)' }}>{notice}</div> : null}
      {error ? <div className="error">{error}</div> : null}

      <div className="card">
        <h2>New campaign</h2>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void doPreview(e);
          }}
        >
          <div className="row">
            <label style={{ flex: 1 }}>
              Campaign name
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Sunday reminder"
              />
            </label>
            <label>
              <span className="row" style={{ gap: '0.4rem' }}>
                <input
                  type="checkbox"
                  checked={form.includeVisitors}
                  onChange={(e) => setForm({ ...form, includeVisitors: e.target.checked })}
                />
                Include visitors
              </span>
            </label>
          </div>
          <label>
            Message ({form.body.length} chars)
            <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required />
          </label>
          <div className="row">
            <button className="secondary" type="submit">
              Preview cost
            </button>
            {preview ? (
              <span className="badge warn">
                {preview.recipients} recipients × {preview.segments} segment(s) = {preview.totalUnits} units
              </span>
            ) : null}
          </div>
          {preview ? (
            <button type="button" onClick={() => void sendCampaign()} disabled={preview.totalUnits > (wallet?.balanceUnits ?? 0)}>
              Send now ({preview.totalUnits} units)
            </button>
          ) : null}
        </form>
      </div>
      <div className="grid cols-2">
        <div className="card">
          <h2>Campaigns</h2>
          <table>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>
                    <span className={`badge ${c.status === 'DONE' ? 'ok' : c.status === 'SENDING' ? 'warn' : 'mute'}`}>
                      {c.status}
                    </span>
                  </td>
                  <td>{c.totalRecipients}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {campaigns.length === 0 ? <p className="muted">No campaigns yet.</p> : null}
        </div>

        <div className="card">
          <h2>Opt-outs ({optOuts.length})</h2>
          <table>
            <tbody>
              {optOuts.map((o) => (
                <tr key={o.phoneE164}>
                  <td>{o.phoneE164}</td>
                  <td>{fmtDateTime(o.createdAt)}</td>
                  <td>
                    <button className="small secondary" onClick={() => void removeOptOut(o.phoneE164)}>
                      Re-subscribe
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {optOuts.length === 0 ? <p className="muted">Nobody opted out. STOP replies land here.</p> : null}
        </div>
      </div>

      <div className="card">
        <h2>Recent messages</h2>
        <table>
          <thead>
            <tr>
              <th>To</th>
              <th>Message</th>
              <th>Seg</th>
              <th>Source</th>
              <th>Status</th>
              <th>Queued</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td>{l.toE164}</td>
                <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {l.body}
                </td>
                <td>{l.segments}</td>
                <td>{l.source}</td>
                <td>
                  <span
                    className={`badge ${
                      l.status === 'DELIVERED' || l.status === 'SENT' ? 'ok' : l.status === 'FAILED' ? 'err' : 'mute'
                    }`}
                  >
                    {l.status}
                  </span>
                </td>
                <td>{fmtDateTime(l.queuedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
