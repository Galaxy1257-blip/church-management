'use client';
// Capital campaigns (progress from real gifts) + member pledges.
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { ghs } from '../../../lib/format';

interface Campaign { id: string; name: string; goalMinor: number; raisedMinor: number; pledgedMinor: number }
interface Fund { id: string; name: string }
interface Pledge { id: string; memberId: string; amountMinor: number; frequency: string; fund?: { name: string } }

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [pledges, setPledges] = useState<Pledge[]>([]);
  const [campForm, setCampForm] = useState({ name: '', goal: '', fundId: '' });
  const [pledgeForm, setPledgeForm] = useState({ memberId: '', fundId: '', amount: '' });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function load(): Promise<void> {
    try {
      const [c, f, p] = await Promise.all([
        api<Campaign[]>('/campaigns'),
        api<Fund[]>('/giving/funds'),
        api<Pledge[]>('/pledges'),
      ]);
      setCampaigns(c); setFunds(f); setPledges(p);
      if (!campForm.fundId && f[0]) setCampForm((prev) => ({ ...prev, fundId: f[0].id }));
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'failed'); }
  }
  useEffect(() => { void load(); }, []);

  async function createCampaign(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await api('/campaigns', { method: 'POST', body: { name: campForm.name, fundId: campForm.fundId, goalMinor: Math.round(Number(campForm.goal) * 100), startsOn: new Date().toISOString() } });
      setCampForm({ ...campForm, name: '', goal: '' });
      setNotice('Campaign launched');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'failed'); }
  }

  async function addPledge(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await api('/pledges', { method: 'POST', body: { memberId: pledgeForm.memberId, fundId: pledgeForm.fundId, amountMinor: Math.round(Number(pledgeForm.amount) * 100), startsOn: new Date().toISOString() } });
      setPledgeForm({ memberId: '', fundId: pledgeForm.fundId, amount: '' });
      setNotice('Pledge recorded (intent only — never counted as money)');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'failed'); }
  }

  return (
    <div>
      <h1>Campaigns &amp; Pledges</h1>
      {notice ? <div className="card" style={{ borderColor: 'var(--accent)' }}>{notice}</div> : null}
      {error ? <div className="error">{error}</div> : null}
      <div className="card">
        <h2>Campaigns (progress = actual gifts)</h2>
        {campaigns.map((c) => {
          const pct = Math.min(100, Math.round((c.raisedMinor / Math.max(c.goalMinor, 1)) * 100));
          return (
            <div key={c.id} style={{ marginBottom: 10 }}>
              <div className="spread"><strong>{c.name}</strong><span className="muted">{ghs(c.raisedMinor)} / {ghs(c.goalMinor)} · pledged {ghs(c.pledgedMinor)}</span></div>
              <div style={{ background: 'var(--bg-soft)', borderRadius: 8, height: 12, marginTop: 4 }}>
                <div style={{ width: `${pct}%`, background: 'var(--accent)', height: '100%', borderRadius: 8 }} />
              </div>
            </div>
          );
        })}
        <form className="row" onSubmit={createCampaign} style={{ marginTop: 8 }}>
          <input placeholder="Campaign name" value={campForm.name} onChange={(e) => setCampForm({ ...campForm, name: e.target.value })} required style={{ flex: 2 }} />
          <input placeholder="Goal GHS" value={campForm.goal} onChange={(e) => setCampForm({ ...campForm, goal: e.target.value })} inputMode="decimal" style={{ flex: 1 }} />
          <select value={campForm.fundId} onChange={(e) => setCampForm({ ...campForm, fundId: e.target.value })}>
            {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <button>Launch</button>
        </form>
      </div>
      <div className="card">
        <h2>Pledges</h2>
        <form className="row" onSubmit={addPledge}>
          <input placeholder="Member ID" value={pledgeForm.memberId} onChange={(e) => setPledgeForm({ ...pledgeForm, memberId: e.target.value })} required style={{ flex: 1 }} />
          <select value={pledgeForm.fundId} onChange={(e) => setPledgeForm({ ...pledgeForm, fundId: e.target.value })}>
            {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <input placeholder="Amount GHS" value={pledgeForm.amount} onChange={(e) => setPledgeForm({ ...pledgeForm, amount: e.target.value })} inputMode="decimal" style={{ flex: 1 }} />
          <button>Add pledge</button>
        </form>
        <table><thead><tr><th>Member</th><th>Fund</th><th>Amount</th><th>Frequency</th></tr></thead><tbody>
          {pledges.map((p) => (
            <tr key={p.id}><td className="muted">{p.memberId.slice(0, 8)}…</td><td>{p.fund?.name ?? '—'}</td><td>{ghs(p.amountMinor)}</td><td>{p.frequency}</td></tr>
          ))}
        </tbody></table>
      </div>
    </div>
  );
}
