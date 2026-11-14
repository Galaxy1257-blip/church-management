'use client';
// Children's check-in: dual ticket (child tag + guardian pickup code).
//
// The desk works from names: the roster endpoint returns every registered child
// with the adults allowed to collect them, so nobody types a member UUID.
import { useEffect, useMemo, useState } from 'react';
import { hasPermission } from '../../../lib/access';
import { api } from '../../../lib/api';
import { getSession } from '../../../lib/session';
import { fmtDateTime } from '../../../lib/format';
import Notice from '../../../components/notice';

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
interface Skips {
  today: string;
  isSunday: boolean;
  skippedToday: boolean;
  dates: string[];
  upcoming: { date: string; label: string; skipped: boolean }[];
}

/** A saved YYYY-MM-DD, read at midday so the display cannot slip a day. */
function dayLabel(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? date
    : d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
}

/** The chip style for the child or guardian the desk has already chosen. */
const picked = { background: 'var(--brand)', color: 'var(--brand-ink)', borderColor: 'var(--brand)' };

interface PickupText { status: string; guardian: string }

/** What actually happened to the guardian's text — queued is not delivered. */
function textLine(sms: PickupText | undefined): string {
  switch (sms?.status) {
    case 'QUEUED': return `A text was queued for ${sms.guardian}.`;
    case 'NO_PHONE': return `No phone number is on record for ${sms.guardian} — no text was queued.`;
    case 'NO_CONSENT': return `${sms.guardian} has opted out of church texts — no text was queued.`;
    case 'OPTED_OUT': return `${sms.guardian} has replied STOP — no text was queued.`;
    case 'BAD_PHONE': return `The number on record for ${sms.guardian} could not be read — no text was queued.`;
    case 'NO_BALANCE': return 'No SMS credit left — the text was not queued.';
    case 'QUIET_HOURS': return 'Quiet hours are on — the text was held until morning.';
    default: return '';
  }
}

export default function ChildrenPage() {
  const [services, setServices] = useState<Service[] | null>(null);
  const [serviceId, setServiceId] = useState('');
  const [roster, setRoster] = useState<Child[]>([]);
  const [people, setPeople] = useState<MemberOption[]>([]);
  // The office keeps the pickup lists; a class teacher only runs the desk. Null
  // until the session answers, so the office-only form is never shown to someone
  // the API would refuse.
  const [canManage, setCanManage] = useState<boolean | null>(null);
  const [link, setLink] = useState({ childId: '', guardianId: '', relation: 'Parent' });
  const [active, setActive] = useState<Active[]>([]);
  const [search, setSearch] = useState('');
  const [childId, setChildId] = useState('');
  const [guardianId, setGuardianId] = useState('');
  const [pickupId, setPickupId] = useState('');
  const [code, setCode] = useState('');
  const [ticket, setTicket] = useState<{ tagNo: string; pickupCode: string; sms?: PickupText } | null>(null);
  // Days the church marked off for Sunday School. The server says whether today
  // is one of them, because only it knows the church's own timezone.
  const [skips, setSkips] = useState<Skips | null>(null);
  const [deskOpenAnyway, setDeskOpenAnyway] = useState(false);
  const [savingSkips, setSavingSkips] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    // The desk needs a service, and it asks the children's own endpoint for it:
    // GET /services belongs to the Services section, which a church can switch
    // off while still running Sunday School.
    void api<Service[]>('/children/services').then((s) => {
      setServices(s);
      const open = s.find((x) => x.status === 'OPEN') ?? s[0];
      if (open) setServiceId(open.id);
    }).catch(() => undefined);
    void api<Child[]>('/children/roster').then(setRoster).catch(() => undefined);
    void api<Skips>('/children/skips').then(setSkips).catch(() => undefined);
    void getSession().then((s) => {
      const manage = hasPermission(s.permissions, 'members:write');
      setCanManage(manage);
      // The directory behind the pickup-list picker is the office's, not the teacher's.
      if (manage) void api<{ items: MemberOption[] }>('/members?pageSize=200').then((r) => setPeople(r.items)).catch(() => undefined);
    }).catch(() => undefined);
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
  const mayCollect = inside ? roster.find((c) => c.id === inside.childId)?.guardians ?? [] : [];
  // A Sunday the church marked off starts with the drop-off closed. Pick up is
  // never hidden: a child already inside still has to be able to go home.
  const closedByPlan = Boolean(skips?.skippedToday) && !deskOpenAnyway;
  const skippedLabel = skips?.skippedToday ? dayLabel(skips.today) : '';

  async function reloadActive(): Promise<void> {
    if (serviceId) setActive(await api<Active[]>(`/children/active?serviceId=${serviceId}`));
  }

  /** Mark a Sunday off, or back on. Nothing is saved until the office presses save. */
  function toggleSkip(date: string): void {
    setSkips((s) => {
      if (!s) return s;
      const on = !s.dates.includes(date);
      const dates = on ? [...s.dates, date].sort() : s.dates.filter((d) => d !== date);
      return {
        ...s,
        dates,
        upcoming: s.upcoming.map((d) => (d.date === date ? { ...d, skipped: on } : d)),
      };
    });
  }

  async function saveSkips(): Promise<void> {
    if (!skips) return;
    setSavingSkips(true);
    setError('');
    setNotice('');
    try {
      const saved = await api<Skips>('/children/skips', { method: 'PUT', body: { dates: skips.dates } });
      setSkips(saved);
      setNotice(
        saved.dates.length === 0
          ? 'No Sundays are marked off — the desk expects children every Sunday.'
          : 'Days off saved — the desk will say so on those Sundays.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not save the days off');
    } finally {
      setSavingSkips(false);
    }
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
      const res = await api<{ tagNo: string; pickupCode: string; sms?: PickupText }>('/children/checkin', {
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
      const res = await api<{ sms?: PickupText }>('/children/checkout', {
        method: 'POST',
        body: { serviceId, childId: inside.childId, code: code.trim() },
      });
      setNotice(
        `${inside.childName} was handed over. Give the tag back and keep the code secret for next time.` +
          (textLine(res.sms) ? ` ${textLine(res.sms)}` : ''),
      );
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
      {canManage === false ? (
        <p className="muted">You see the children in your Sunday School class, and only them.</p>
      ) : null}
      {error ? <Notice kind="error" text={error} onDone={() => setError('')} /> : null}
      {notice ? <Notice text={notice} onDone={() => setNotice('')} /> : null}

      <div className="card">
        {services && services.length === 0 ? (
          // An empty picker with no reason is how the desk used to fail when the
          // Services section was switched off. Say what is missing instead.
          <p className="muted">
            No service to check into yet. The desk works from the Sunday service, so one has to exist. A church
            admin can switch Services on in Settings → App sections and add it there.
          </p>
        ) : (
          <label>Service
            <select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              {services?.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.status})</option>) ?? null}
            </select>
          </label>
        )}
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
          {textLine(ticket.sms) ? <p className="muted">{textLine(ticket.sms)}</p> : null}
        </div>
      ) : null}

      {closedByPlan ? (
        <div className="card" style={{ borderColor: 'var(--accent)' }}>
          <h2>Sunday School is marked off today</h2>
          <p className="muted">
            {skippedLabel} is on the days-off list, so no children are expected. Pick up still works
            for any child already inside.
          </p>
          <button className="secondary" onClick={() => setDeskOpenAnyway(true)}>Open the desk anyway</button>
        </div>
      ) : skips?.skippedToday ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Today was marked off, but the desk has been opened. Check a child in only if they are really here.
          </p>
        </div>
      ) : null}

      <div className="card" hidden={closedByPlan}>
        <h2>Drop off</h2>
        {roster.length === 0 ? (
          <p className="muted">
            {canManage === false
              ? 'No child in your class is on the list yet. The office adds the children and records who may collect them.'
              : 'No children are registered yet. Add a child in Members, then record who is allowed to pick them up.'}
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

      {canManage === true && skips ? (
        <div className="card">
          <h2>Days off</h2>
          <p className="muted">
            Tick a Sunday the church will not run Sunday School — school holidays, a teacher away, a fifth Sunday.
            On that day the desk says so and starts closed; anyone can still open it if a child turns up, and
            pick up is never blocked.
          </p>
          {skips.upcoming.length === 0 ? (
            <p className="muted">No Sundays to show.</p>
          ) : (
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              {skips.upcoming.map((d) => (
                <button
                  key={d.date}
                  type="button"
                  className="small"
                  style={d.skipped ? picked : undefined}
                  onClick={() => toggleSkip(d.date)}
                >
                  {d.label}
                </button>
              ))}
            </div>
          )}
          <div className="row">
            <button onClick={() => void saveSkips()} disabled={savingSkips}>
              {savingSkips ? 'Saving…' : 'Save days off'}
            </button>
          </div>
        </div>
      ) : null}

      {canManage === true ? (
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
      ) : null}

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
              <>
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
                {/* Staff need to see who is allowed to take this child home before
                    releasing them — the names the office approved, not the person who
                    happened to drop them off. */}
                <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
                  Who may collect {inside.childName}:{' '}
                  {mayCollect.length > 0
                    ? mayCollect.map((g) => g.name).join(', ')
                    : 'no approved guardian on record — add one in “Who may collect”'}
                </p>
              </>
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
