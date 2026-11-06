'use client';
// Capital campaigns (progress from real gifts) + member pledges.
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { fmtDate, ghs } from '../../../lib/format';
import type { PdfDoc } from '../../../lib/pdf';
import { sharePdf } from '../../../lib/share';
import { peekSession } from '../../../lib/session';
import Notice from '../../../components/notice';

interface Campaign { id: string; name: string; goalMinor: number; raisedMinor: number; pledgedMinor: number; startsOn: string; endsOn: string | null }
interface Fund { id: string; name: string }
interface Pledge {
  id: string; memberId: string; amountMinor: number; frequency: string;
  fund?: { name: string } | null;
  member?: { firstName: string; lastName: string; memberNo: string } | null;
  campaign?: { name: string } | null;
}

const FREQUENCY: Record<string, string> = { ONE_TIME: 'Once', WEEKLY: 'Every week', MONTHLY: 'Every month' };

/** The board sheet: how far each appeal has come, and who promised what. */
function sheetDoc(campaigns: Campaign[], pledges: Pledge[]): PdfDoc {
  const goal = campaigns.reduce((a, c) => a + c.goalMinor, 0);
  const raised = campaigns.reduce((a, c) => a + c.raisedMinor, 0);
  const promised = pledges.reduce((a, p) => a + p.amountMinor, 0);
  return {
    title: 'Campaign progress',
    subtitle: `Prepared ${fmtDate(new Date())} · ${campaigns.length} campaign${campaigns.length === 1 ? '' : 's'}`,
    blocks: [
      {
        kind: 'fields',
        rows: [
          { label: 'Given so far', value: ghs(raised), bold: true },
          { label: 'Total goal', value: ghs(goal) },
          { label: 'Promised by members', value: ghs(promised) },
          { label: 'Still to come', value: ghs(Math.max(goal - raised, 0)) },
        ],
      },
      { kind: 'heading', text: 'Each appeal', spaceBefore: 10 },
      {
        kind: 'table',
        columns: [
          { label: 'Campaign', grow: 2.4 },
          { label: 'Runs', grow: 2.2 },
          { label: 'Goal', grow: 1.4, align: 'right' },
          { label: 'Given', grow: 1.4, align: 'right' },
          { label: 'How far', grow: 1.2, align: 'right' },
        ],
        rows: campaigns.map((c) => [
          c.name,
          `${fmtDate(c.startsOn)} - ${c.endsOn ? fmtDate(c.endsOn) : 'still open'}`,
          ghs(c.goalMinor),
          ghs(c.raisedMinor),
          `${Math.min(100, Math.round((c.raisedMinor / Math.max(c.goalMinor, 1)) * 100))}%`,
        ]),
      },
      { kind: 'heading', text: 'Promises made', spaceBefore: 10 },
      {
        kind: 'table',
        columns: [
          { label: 'Name', grow: 2.4 },
          { label: 'Number', grow: 1.4 },
          { label: 'Fund', grow: 1.8 },
          { label: 'Amount', grow: 1.5, align: 'right' },
          { label: 'How often', grow: 1.5 },
        ],
        rows: pledges.map((p) => [
          p.member ? `${p.member.firstName} ${p.member.lastName}` : 'No longer on the book',
          p.member?.memberNo ?? '-',
          p.fund?.name ?? '-',
          ghs(p.amountMinor),
          FREQUENCY[p.frequency] ?? p.frequency,
        ]),
      },
      {
        kind: 'text',
        muted: true,
        size: 9,
        spaceBefore: 14,
        text: 'A promise is not money. The given column counts only gifts the church has actually received on that fund inside the campaign dates.',
      },
    ],
    footnote: 'Campaign sheet from the church app. Promises are what members told the church they intend to give.',
  };
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [pledges, setPledges] = useState<Pledge[]>([]);
  const [campForm, setCampForm] = useState({ name: '', goal: '', fundId: '', endsOn: '' });
  const [pledgeForm, setPledgeForm] = useState({ memberId: '', fundId: '', amount: '' });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
      // An empty end date is sent as no end date, not as an invalid one.
      const endsOn = campForm.endsOn ? new Date(`${campForm.endsOn}T12:00:00`).toISOString() : undefined;
      await api('/campaigns', { method: 'POST', body: { name: campForm.name, fundId: campForm.fundId, goalMinor: Math.round(Number(campForm.goal) * 100), startsOn: new Date().toISOString(), ...(endsOn ? { endsOn } : {}) } });
      setCampForm({ ...campForm, name: '', goal: '', endsOn: '' });
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

  async function printSheet(): Promise<void> {
    setBusy(true);
    setError('');
    const result = await sharePdf({
      church: peekSession()?.church,
      doc: sheetDoc(campaigns, pledges),
      filename: `campaigns-${new Date().toISOString().slice(0, 10)}.pdf`,
      title: 'Campaign progress',
      text: `${campaigns.length} campaigns`,
    });
    if (result.kind === 'failed') setError(result.message);
    else if (result.message) setNotice(result.message);
    setBusy(false);
  }

  return (
    <div>
      <h1>Campaigns &amp; Pledges</h1>
      {notice ? <Notice text={notice} onDone={() => setNotice('')} /> : null}
      {error ? <Notice kind="error" text={error} onDone={() => setError('')} /> : null}
      <div className="card">
        <div className="spread">
          <h2>Campaigns (progress = actual gifts)</h2>
          <button className="small" onClick={() => void printSheet()} disabled={busy || !campaigns.length}>
            {busy ? 'Preparing...' : 'Board sheet'}
          </button>
        </div>
        {campaigns.map((c) => {
          const pct = Math.min(100, Math.round((c.raisedMinor / Math.max(c.goalMinor, 1)) * 100));
          return (
            <div key={c.id} style={{ marginBottom: 10 }}>
              <div className="spread"><strong>{c.name}</strong><span className="muted">{ghs(c.raisedMinor)} / {ghs(c.goalMinor)} · pledged {ghs(c.pledgedMinor)}</span></div>
              {/* Progress is the gifts on this fund inside these dates, so the
                  dates have to be visible or two campaigns can look identical. */}
              <div className="muted" style={{ fontSize: '.8rem', marginTop: 2 }}>
                {fmtDate(c.startsOn)} – {c.endsOn ? fmtDate(c.endsOn) : 'no end date'}
              </div>
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
          <label style={{ fontSize: '.82rem' }}>
            <span className="muted">Counts gifts until</span>
            <input type="date" value={campForm.endsOn} onChange={(e) => setCampForm({ ...campForm, endsOn: e.target.value })} />
          </label>
          <button>Launch</button>
        </form>
        <p className="muted" style={{ fontSize: '.82rem', marginBottom: 0 }}>
          The total is every gift to that fund from today, and up to the day you choose. Leave it blank and the
          campaign keeps counting later gifts on that fund.
        </p>
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
            <tr key={p.id}>
              <td>{p.member ? `${p.member.firstName} ${p.member.lastName}` : 'No longer on the book'} <span className="muted">{p.member?.memberNo ?? ''}</span></td>
              <td>{p.fund?.name ?? '—'}</td><td>{ghs(p.amountMinor)}</td><td>{FREQUENCY[p.frequency] ?? p.frequency}</td>
            </tr>
          ))}
        </tbody></table>
      </div>
    </div>
  );
}
