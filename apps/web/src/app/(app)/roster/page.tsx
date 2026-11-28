'use client';
// Volunteer roster: assign shifts per service, confirm/decline, print the sheet.
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import type { PdfDoc } from '../../../lib/pdf';
import { sharePdf } from '../../../lib/share';
import { peekSession } from '../../../lib/session';
import MemberPicker from '../../../components/member-picker';
import Notice from '../../../components/notice';

interface Shift { id: string; serviceId: string; memberId: string; duty: string; status: string; memberName?: string; memberNo?: string }
interface Service { id: string; name: string; startsAt: string }
interface Group { id: string; name: string; type: string }

/** What a leader carries to rehearsal: who is standing where, and who has answered. */
function rosterDoc(service: Service | undefined, shifts: Shift[]): PdfDoc {
  const name = (s: Shift) => s.memberName ?? 'No longer on the book';
  const confirmed = shifts.filter((s) => s.status === 'CONFIRMED').length;
  const declined = shifts.filter((s) => s.status === 'DECLINED').length;
  return {
    title: 'Volunteer roster',
    subtitle: service ? `${service.name} · ${new Date(service.startsAt).toLocaleDateString('en-GB')}` : 'Duty list',
    blocks: [
      {
        kind: 'fields',
        rows: [
          { label: 'Duties covered', value: String(shifts.length), bold: true },
          { label: 'Said yes', value: String(confirmed) },
          { label: 'Said no', value: String(declined) },
          { label: 'Still to answer', value: String(shifts.length - confirmed - declined) },
        ],
      },
      { kind: 'heading', text: 'Who is standing where', spaceBefore: 10 },
      {
        kind: 'table',
        columns: [
          { label: 'Duty', grow: 2.4 },
          { label: 'Name', grow: 2.6 },
          { label: 'Number', grow: 1.4 },
          { label: 'Answer', grow: 1.6 },
        ],
        rows: shifts.map((s) => [s.duty, name(s), s.memberNo ?? '—', s.status === 'CONFIRMED' ? 'Yes' : s.status === 'DECLINED' ? 'No' : 'Not answered']),
      },
    ],
    footnote: 'Duty list taken from the church app at the time it was prepared. Anyone listed still has to say yes.',
  };
}

export default function RosterPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [serviceId, setServiceId] = useState('');
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [form, setForm] = useState({ groupId: '', memberId: '', duty: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<Service[]>('/services').then((s) => {
      setServices(s);
      if (s[0]) setServiceId(s[0].id);
    });
    void api<Group[]>('/groups').then((g) => {
      setGroups(g);
      if (g[0]) setForm((prev) => ({ ...prev, groupId: prev.groupId || g[0].id }));
    }).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (serviceId) void api<Shift[]>(`/roster?serviceId=${serviceId}`).then(setShifts).catch(() => undefined);
  }, [serviceId]);

  async function assign(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await api('/roster', { method: 'POST', body: { serviceId, ...form } });
      setNotice('Shift assigned');
      setForm((prev) => ({ ...prev, memberId: '', duty: '' }));
      setShifts(await api<Shift[]>(`/roster?serviceId=${serviceId}`));
    } catch (err) { setError(err instanceof Error ? err.message : 'failed'); }
  }

  async function respond(id: string, status: 'CONFIRMED' | 'DECLINED'): Promise<void> {
    try {
      await api(`/roster/${id}/respond`, { method: 'POST', body: { status } });
      setShifts(await api<Shift[]>(`/roster?serviceId=${serviceId}`));
    } catch (err) { setError(err instanceof Error ? err.message : 'failed'); }
  }

  async function printSheet(): Promise<void> {
    setBusy(true);
    setNotice('');
    setError('');
    const result = await sharePdf({
      church: peekSession()?.church,
      doc: rosterDoc(services.find((s) => s.id === serviceId), shifts),
      filename: `roster-${serviceId ? serviceId.slice(0, 8) : 'service'}.pdf`,
      title: 'Volunteer roster',
      text: `${shifts.length} duties`,
    });
    if (result.kind === 'failed') setError(result.message);
    else if (result.message) setNotice(result.message);
    setBusy(false);
  }

  return (
    <div>
      <h1>Volunteer roster</h1>
      {notice ? <Notice text={notice} onDone={() => setNotice('')} /> : null}
      {error ? <Notice kind="error" text={error} onDone={() => setError('')} /> : null}
      <div className="card">
        <label>Service
          <select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name} — {new Date(s.startsAt).toLocaleDateString()}</option>)}
          </select>
        </label>
        <form className="row" onSubmit={assign}>
          <select aria-label="Group" value={form.groupId} onChange={(e) => setForm({ ...form, groupId: e.target.value })} required>
            {groups.length === 0 ? <option value="">No groups yet</option> : null}
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <div style={{ flex: 1 }}>
            <MemberPicker value={form.memberId} onChange={(id) => setForm({ ...form, memberId: id })} required />
          </div>
          <input aria-label="Duty" placeholder="Duty (e.g. Ushering)" value={form.duty} onChange={(e) => setForm({ ...form, duty: e.target.value })} required style={{ flex: 1 }} />
          <button disabled={!form.groupId || !form.memberId}>Assign</button>
        </form>
      </div>
      <div className="card">
        <div className="spread">
          <h2>Shifts</h2>
          <button className="small" onClick={() => void printSheet()} disabled={busy || !serviceId}>
            {busy ? 'Preparing...' : 'Print the sheet'}
          </button>
        </div>
        <div className="table-wrap">
        <table><thead><tr><th>Duty</th><th>Member</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          {shifts.map((s) => (
            <tr key={s.id}>
              <td>{s.duty}</td>
              <td>{s.memberName ?? '—'} <span className="muted">{s.memberNo ?? ''}</span></td>
              <td><span className={`badge ${s.status === 'CONFIRMED' ? 'ok' : s.status === 'DECLINED' ? 'err' : 'warn'}`}>{s.status}</span></td>
              <td className="row">
                <button className="small" onClick={() => void respond(s.id, 'CONFIRMED')}>YES</button>
                <button className="small danger" onClick={() => void respond(s.id, 'DECLINED')}>NO</button>
              </td>
            </tr>
          ))}
        </tbody></table>
        </div>
        {shifts.length === 0 ? <p className="muted">No shifts for this service.</p> : null}
      </div>
    </div>
  );
}
