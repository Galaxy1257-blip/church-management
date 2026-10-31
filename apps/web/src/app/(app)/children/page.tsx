'use client';
// Children's check-in: dual ticket (child tag + guardian pickup code).
//
// The desk works from names: the roster endpoint returns every registered child
// with the adults allowed to collect them, so nobody types a member UUID.
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../lib/api';
import { fmtDateTime } from '../../../lib/format';

interface Guardian {
  id: string;
  name: string;
}
interface Child {
  id: string;
  name: string;
  memberNo: string;
  guardians: Guardian[];
}
interface Active {
  id: string;
  childId: string;
  tagNo: string;
  checkedInAt: string;
  childName: string;
  guardianName: string;
}
interface Service {
  id: string;
  name: string;
  status: string;
}
interface MemberOption {
  id: string;
  memberNo: string;
  firstName: string;
  lastName: string;
}

/** The chip style for the child or guardian the desk has already chosen. */
const picked = { background: 'var(--brand)', color: 'var(--brand-ink)', borderColor: 'var(--brand)' };

export default function ChildrenPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [serviceId, setServiceId] = useState('');
  const [roster, setRoster] = useState<Child[]>([]);
  const [people, setPeople] = useState<MemberOption[]>([]);
  const [link, setLink] = useState({ childId: '', guardianId: '', relation: 'Parent' });
  const [active, setActive] = useState<Active[]>([]);
  const [search, setSearch] = useState('');
  const [childId, setChildId] = useState('');
  const [guardianId, setGuardianId] = useState('');
  const [pickupId, setPickupId] = useState('');
  const [code, setCode] = useState('');
  const [ticket, setTicket] = useState<{ tagNo: string; pickupCode: string } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    void api<Service[]>('/services').then((s) => {
      setServices(s);
      const open = s.find((x) => x.status === 'OPEN') ?? s[0];
      if (open) setServiceId(open.id);
    });
    void api<Child[]>('/children/roster').then(setRoster).catch(() => undefined);
    void api<{ items: MemberOption[] }>('/members?pageSize=200').then((r) => setPeople(r.items)).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (serviceId) void api<Active[]>(`/children/active?serviceId=${serviceId}`).then(setActive).catch(() => undefined);
  }, [serviceId]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return roster.slice(0, 8);
    return roster.filter((c) => c.name.toLowerCase().includes(q) || c.memberNo.toLowerCase().includes(q)).slice(0, 8);
  }, [roster, search]);

  const chosen = roster.find((c) => c.id === childId) ?? null;
  const inside = active.find((a) => a.childId === pickupId) ?? null;

  async function reloadActive(): Promise<void> {
    if (serviceId) setActive(await api<Active[]>(`/children/active?serviceId=${serviceId}`));
  }

  /** Say who may collect a child. Until this exists, the desk cannot check anyone in. */
  async function saveLink(): Promise<void> {
    if (!link.childId || !link.guardianId) return;
    setError('');
    setNotice('');
    try {
      await api('/children/guardian', { method: 'POST', body: link });
      setRoster(await api<Child[]>('/children/roster'));
      setNotice('They are now on the pickup list for that child.');
      setLink({ ...link, childId: '', guardianId: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not save the pickup list');
    }
  }

  async function checkIn(): Promise<void> {
    if (!chosen || !guardianId) return;
    setError('');
    setNotice('');
    try {
      const res = await api<{ tagNo: string; pickupCode: string }>('/children/checkin', {
        method: 'POST',
        body: { serviceId, childId: chosen.id, guardianId },
      });
      setTicket(res);
      setChildId('');
      setGuardianId('');
      setSearch('');
      await reloadActive();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not check the child in');
    }
  }

  async function checkOut(): Promise<void> {
    if (!inside || !code.trim()) return;
    setError('');
    setNotice('');
    try {
      await api('/children/checkout', { method: 'POST', body: { serviceId, childId: inside.childId, code: code.trim() } });
      setNotice(`${inside.childName} was handed over. Give the tag back and keep the code secret for next time.`);
      setPickupId('');
      setCode('');
      await reloadActive();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not release the child');
    }
  }

  return (
    <div>
      <h1>Children</h1>
      {error ? <div className="error">{error}</div> : null}
      {notice ? <div className="card" style={{ borderColor: 'var(--accent)' }}>{notice}</div> : null}

      <div className="card">
        <label>Service
          <select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.status})</option>)}
          </select>
        </label>
      </div>

      {ticket ? (
        <div className="card" style={{ borderColor: 'var(--accent)', textAlign: 'center' }}>
          <h2>Ticket issued</h2>
          <div className="grid cols-2">
            <div>
              <div className="muted">Tag on the child</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{ticket.tagNo}</div>
            </div>
            <div>
              <div className="muted">Code for the guardian</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--danger)' }}>{ticket.pickupCode}</div>
            </div>
          </div>
          <p className="muted">Show the code only at pickup. Five wrong tries locks the release.</p>
        </div>
      ) : null}

      <div className="card">
        <h2>Drop off</h2>
        {roster.length === 0 ? (
          <p className="muted">
            No children are registered yet. Add a child in Members, then record who is allowed to pick them up.
          </p>
        ) : (
          <>
            <label>Find the child
              <input
                placeholder="Name or member number"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setChildId('');
                  setGuardianId('');
                }}
              />
            </label>
            {search && matches.length === 0 ? <p className="muted">No registered child matches &quot;{search}&quot;.</p> : null}
            {matches.length > 0 && !chosen ? (
              <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                {matches.map((c) => (
                  <button key={c.id} className="small" onClick={() => setChildId(c.id)}>
                    {c.name}
                  </button>
                ))}
              </div>
            ) : null}
            {chosen ? (
              <div className="stack">
                <p style={{ margin: 0 }}>
                  <b>{chosen.name}</b> <span className="muted">({chosen.memberNo})</span>
                </p>
                <p className="muted" style={{ margin: 0 }}>Who brought them today?</p>
                <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                  {chosen.guardians.map((g) => (
                    <button
                      key={g.id}
                      className="small"
                      style={guardianId === g.id ? picked : undefined}
                      onClick={() => setGuardianId(g.id)}
                    >
                      {g.name}
                    </button>
                  ))}
                </div>
                <div className="row">
                  <button disabled={!guardianId} onClick={() => void checkIn()}>
                    Check in {chosen.name.split(' ')[0]}
                  </button>
                  <button className="small" onClick={() => { setChildId(''); setGuardianId(''); setSearch(''); }}>
                    Start again
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="card">
        <h2>Who may collect</h2>
        <details>
          <summary className="muted" style={{ fontSize: '0.85rem' }}>Add a parent or guardian to a child</summary>
          <div className="stack" style={{ marginTop: '0.6rem' }}>
            <label>Child
              <select value={link.childId} onChange={(e) => setLink({ ...link, childId: e.target.value })}>
                <option value="">Choose a child…</option>
                {people.map((m) => <option key={m.id} value={m.id}>{m.firstName} {m.lastName} ({m.memberNo})</option>)}
              </select>
            </label>
            <label>Collected by
              <select value={link.guardianId} onChange={(e) => setLink({ ...link, guardianId: e.target.value })}>
                <option value="">Choose the person who will pick up…</option>
                {people.map((m) => <option key={m.id} value={m.id}>{m.firstName} {m.lastName} ({m.memberNo})</option>)}
              </select>
            </label>
            <label>Relation
              <input value={link.relation} onChange={(e) => setLink({ ...link, relation: e.target.value })} placeholder="Parent, aunt, grandparent" />
            </label>
            <button disabled={!link.childId || !link.guardianId} onClick={() => void saveLink()}>
              Save pickup list
            </button>
            <p className="muted" style={{ fontSize: '0.85rem', margin: 0 }}>
              A child can only be checked in to someone on this list, and only that person can release them with the code.
            </p>
          </div>
        </details>
      </div>

      <div className="card">
        <h2>Pick up</h2>
        {active.length === 0 ? (
          <p className="muted">No child is checked in right now.</p>
        ) : (
          <div className="stack">
            <p className="muted" style={{ margin: 0 }}>Choose the child, then type the 6-digit code they were given.</p>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              {active.map((a) => (
                <button key={a.id} className="small" style={pickupId === a.childId ? picked : undefined} onClick={() => setPickupId(a.childId)}>
                  {a.childName} ({a.tagNo})
                </button>
              ))}
            </div>
            {inside ? (
              <div className="row" style={{ alignItems: 'flex-end', gap: 8 }}>
                <label style={{ flex: 1 }}>Collected by {inside.guardianName}
                  <input
                    placeholder="6-digit code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                  />
                </label>
                <button className="danger" disabled={code.length !== 6} onClick={() => void checkOut()}>
                  Release child
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Inside now ({active.length})</h2>
        {active.length === 0 ? (
          <p className="muted">Nobody is in the children&apos;s area.</p>
        ) : (
          <table>
            <thead><tr><th>Child</th><th>Tag</th><th>Brought by</th><th>Since</th></tr></thead>
            <tbody>
              {active.map((a) => (
                <tr key={a.id}>
                  <td>{a.childName}</td>
                  <td><b>{a.tagNo}</b></td>
                  <td className="muted">{a.guardianName}</td>
                  <td>{fmtDateTime(a.checkedInAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
