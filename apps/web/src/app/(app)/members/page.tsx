'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { fmtDate } from '../../../lib/format';
import { fileToPhotoDataUrl } from '../../../lib/photo';
import MemberDrawer from '../../../components/member-drawer';

interface Member {
  id: string;
  memberNo: string;
  firstName: string;
  lastName: string;
  phoneE164: string | null;
  ageSegment: string;
  status: string;
  joinedAt: string | null;
  discipleshipStage?: string | null;
}

interface GroupOption { id: string; name: string; _count?: { members: number } }

interface ImportPreview {
  totalRows: number;
  validRows: number;
  errorRows: number;
  duplicatesExisting: number;
  duplicatesInFile: number;
  rows: {
    rowNumber: number;
    input: { firstName: string; lastName: string; phoneE164?: string };
    errors: string[];
    duplicateOfExisting: boolean;
  }[];
  errorsCsv: string;
}

export default function MembersPage() {
  const [q, setQ] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ firstName: '', lastName: '', phoneE164: '', dob: '', gender: '', address: '' });
  const [formGroups, setFormGroups] = useState<string[]>([]);
  const [formPhoto, setFormPhoto] = useState('');
  const [groupOptions, setGroupOptions] = useState<GroupOption[]>([]);
  const [openMemberId, setOpenMemberId] = useState<string | null>(null);
  const [brackets, setBrackets] = useState<{ id: string; label: string }[]>([]);
  const [counts, setCounts] = useState<{ ageBracketId: string | null; count: number }[]>([]);
  const [bracketFilter, setBracketFilter] = useState('');
  const [promoResult, setPromoResult] = useState<null | { promotions: { name: string; age: number; fromLabel: string; toLabel: string }[] }>(null);
  // R4.12 discipleship pathway + R4.11 per-member export.
  const [stageReport, setStageReport] = useState<{ byStage: { stage: string; count: number }[]; untracked: number } | null>(null);

  const STAGES = ['VISITOR', 'NEW_BELIEVER', 'MEMBER', 'WORKER', 'LEADER'];

  function refreshStages(): void {
    void api<{ byStage: { stage: string; count: number }[]; untracked: number }>('/members/meta/stages').then(setStageReport).catch(() => undefined);
  }

  async function changeStage(id: string, stage: string): Promise<void> {
    try {
      await api(`/members/${id}/stage`, { method: 'POST', body: { stage } });
      setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, discipleshipStage: stage } : m)));
      refreshStages();
    } catch (e) { setError(e instanceof Error ? e.message : 'stage update failed'); }
  }

  async function exportMember(m: Member): Promise<void> {
    try {
      const data = await api<unknown>(`/members/${m.id}/export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${m.memberNo}-${m.lastName}-export.json`;
      a.click();
      URL.revokeObjectURL(url);
      setNotice('Data export downloaded (Act 843 data-access request).');
    } catch (e) { setError(e instanceof Error ? e.message : 'export failed'); }
  }

  const load = useCallback(async (search: string) => {
    try {
      const res = await api<{ total: number; items: Member[] }>(
        `/members?q=${encodeURIComponent(search)}&pageSize=100${bracketFilter ? `&ageBracketId=${bracketFilter}` : ''}`,
      );
      setMembers(res.items);
      setTotal(res.total);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load');
    }
  }, [bracketFilter]);

  useEffect(() => {
    const t = setTimeout(() => void load(q), 250);
    return () => clearTimeout(t);
  }, [q, load]);

  useEffect(() => {
    void api<{ id: string; label: string; isActive?: boolean }[]>('/demographics/brackets').then((b) => setBrackets(b.filter((x) => x.isActive !== false))).catch(() => undefined);
    void api<{ ageBracketId: string | null; count: number }[]>('/demographics/counts').then(setCounts).catch(() => undefined);
    refreshStages();
    void api<GroupOption[]>('/groups').then(setGroupOptions).catch(() => undefined);
  }, [members.length]);

  async function addMember(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await api('/members', {
        method: 'POST',
        body: {
          firstName: form.firstName,
          lastName: form.lastName,
          phoneE164: form.phoneE164 || undefined,
          dob: form.dob || undefined,
          gender: form.gender || undefined,
          address: form.address || undefined,
          photoDataUrl: formPhoto || undefined,
          groupIds: formGroups,
        },
      });
      setNotice(`Added ${form.firstName} ${form.lastName}${formGroups.length ? ` — joined ${formGroups.length} group${formGroups.length === 1 ? '' : 's'}` : ''}`);
      setShowAdd(false);
      setForm({ firstName: '', lastName: '', phoneE164: '', dob: '', gender: '', address: '' });
      setFormGroups([]);
      setFormPhoto('');
      await load(q);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to add');
    }
  }

  async function pickPhoto(file: File | undefined): Promise<void> {
    if (!file) return;
    try {
      setFormPhoto(await fileToPhotoDataUrl(file));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not read photo');
    }
  }

  async function doPreview(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      setPreview(await api<ImportPreview>('/members/import/preview', { method: 'POST', body: { csvText } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'preview failed');
    }
  }

  async function doImport(): Promise<void> {
    if (!preview) return;
    const valid = preview.rows
      .filter((r) => r.errors.length === 0 && !r.duplicateOfExisting)
      .map((r) => r.input);
    try {
      const res = await api<{ imported: number; failed: number }>('/members/import/confirm', {
        method: 'POST',
        body: { rows: valid },
      });
      setNotice(`Imported ${res.imported} members (${res.failed} failed)`);
      setPreview(null);
      setCsvText('');
      setShowImport(false);
      await load(q);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'import failed');
    }
  }

  function downloadErrors(): void {
    if (!preview) return;
    const blob = new Blob([preview.errorsCsv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'import-errors.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function runPromotions(): Promise<void> {
    try {
      const res = await api<{ promotions: typeof promoResult extends null ? never : any }>('/demographics/promotions/run', {
        method: 'POST',
        body: { apply: true },
      });
      setPromoResult(res);
      await load(q);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'promotion run failed');
    }
  }
  const countFor = (id: string | null) => counts.find((c) => c.ageBracketId === id)?.count ?? 0;
  return (
    <div>
      <div className="page-head">
        <h1>Members ({total})</h1>
        <div className="head-actions">
          <button className="secondary" onClick={() => void runPromotions()}>Update age groups</button>
          <button className="secondary" onClick={() => setShowImport((v) => !v)}>Import list</button>
          <button onClick={() => setShowAdd((v) => !v)}>+ Add member</button>
        </div>
      </div>

      {promoResult ? (
        <div className="card" style={{ borderColor: 'var(--accent)' }}>
          <div className="spread">
            <h2 style={{ margin: 0 }}>🎓 Graduations ({promoResult.promotions.length})</h2>
            <button className="small secondary" onClick={() => setPromoResult(null)}>Dismiss</button>
          </div>
          <ul>
            {promoResult.promotions.map((p) => (
              <li key={p.name}>
                <strong>{p.name}</strong> (Age {p.age}): {p.fromLabel} → <strong>{p.toLabel}</strong>
              </li>
            ))}
            {promoResult.promotions.length === 0 ? <li className="muted">Everyone is in the right bracket 🎉</li> : null}
          </ul>
        </div>
      ) : null}

      <div className="chip-scroll" style={{ marginBottom: '0.6rem' }}>
        <button className={`small ${bracketFilter === '' ? '' : 'secondary'}`} onClick={() => setBracketFilter('')}>
          All Ages ({countFor(null) + brackets.reduce((a, b) => a + countFor(b.id), 0)})
        </button>
        {brackets.map((b) => (
          <button
            key={b.id}
            className={`small ${bracketFilter === b.id ? '' : 'secondary'}`}
            onClick={() => setBracketFilter(b.id)}
          >
            {b.label} ({countFor(b.id)})
          </button>
        ))}
      </div>

      {stageReport ? (
        <div className="chip-scroll" style={{ marginBottom: '0.6rem' }}>
          <span className="muted" style={{ marginRight: 6 }}>Pathway:</span>
          {stageReport.byStage.map((s) => (
            <span key={s.stage} className="badge mute">{s.stage.replace('_', ' ')} {s.count}</span>
          ))}
          {stageReport.untracked > 0 ? <span className="badge warn">untracked {stageReport.untracked}</span> : null}
        </div>
      ) : null}

      {notice ? <div className="card" style={{ borderColor: 'var(--accent)' }}>{notice}</div> : null}
      {error ? <div className="error">{error}</div> : null}

      {showAdd ? (
        <div className="card">
          <form className="stack" onSubmit={addMember}>
            <div className="row">
              <label style={{ flex: 1 }}>
                First name
                <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
              </label>
              <label style={{ flex: 1 }}>
                Last name
                <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
              </label>
            </div>
            <div className="row">
              <label style={{ flex: 1 }}>
                Phone
                <input value={form.phoneE164} onChange={(e) => setForm({ ...form, phoneE164: e.target.value })} inputMode="tel" />
              </label>
              <label>
                Date of birth (drives age group)
                <input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
              </label>
              <label>
                Gender
                <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                  <option value="">—</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                </select>
              </label>
            </div>
            <label>
              Where they live
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="e.g. Adenta, House 12" />
            </label>
            <label>
              Photo (optional)
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void pickPhoto(e.target.files?.[0])} />
            </label>
            {formPhoto ? (
              <div className="row">
                <img className="avatar avatar-lg" src={formPhoto} alt="Chosen photo" />
                <button type="button" className="small secondary" onClick={() => setFormPhoto('')}>Remove photo</button>
              </div>
            ) : null}
            {groupOptions.length ? (
              <div>
                <div className="muted" style={{ fontSize: '0.8rem', marginBottom: 4 }}>Add to groups now (optional)</div>
                <div className="chip-scroll">
                  {groupOptions.map((g) => (
                    <label key={g.id} className="badge mute" style={{ cursor: 'pointer', gap: 4, flexDirection: 'row', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>
                      <input
                        type="checkbox"
                        checked={formGroups.includes(g.id)}
                        onChange={(e) =>
                          setFormGroups(e.target.checked ? [...formGroups, g.id] : formGroups.filter((id) => id !== g.id))
                        }
                        style={{ width: 'auto' }}
                      />
                      {g.name}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
            <button>Save member</button>
          </form>
        </div>
      ) : null}

      {showImport ? (
        <div className="card">
          <p className="muted">
            Paste CSV with headers: firstName, lastName, phone, gender, ageSegment. Preview first — nothing is
            written until you confirm.
          </p>
          <form className="stack" onSubmit={doPreview}>
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={'firstName,lastName,phone\nKwame,Asante,0241234567'}
            />
            <button className="secondary">Preview</button>
          </form>
          {preview ? (
            <div style={{ marginTop: '0.8rem' }}>
              <div className="row">
                <span className="badge ok">{preview.validRows} ready</span>
                <span className="badge err">{preview.errorRows} errors</span>
                <span className="badge warn">{preview.duplicatesExisting} duplicates</span>
                <span className="badge mute">{preview.duplicatesInFile} in-file dupes</span>
              </div>
              <div className="row" style={{ marginTop: '0.6rem' }}>
                <button onClick={doImport}>Import {preview.validRows} rows</button>
                <button type="button" className="secondary" onClick={downloadErrors}>
                  Download errors.csv
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="card">
        <input
          placeholder="Search name, phone, member no…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ width: '100%', marginBottom: '0.6rem' }}
        />
        <table>
          <thead>
            <tr>
              <th>No.</th>
              <th>Name</th>
              <th>Phone</th>
              <th>Group</th>
              <th>Joined</th>
              <th>Stage</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>{m.memberNo}</td>
                <td>
                  <button type="button" className="link-button" onClick={() => setOpenMemberId(m.id)}>
                    {m.firstName} {m.lastName}
                  </button>{' '}
                  <button className="small secondary" title="Export this member's data (Act 843)" onClick={() => void exportMember(m)}>⤓</button>
                </td>
                <td>{m.phoneE164 ?? '—'}</td>
                <td>{m.ageSegment}</td>
                <td>{fmtDate(m.joinedAt)}</td>
                <td>
                  <select value={m.discipleshipStage ?? ''} onChange={(e) => void changeStage(m.id, e.target.value || 'VISITOR')} style={{ width: 130 }}>
                    <option value="">(none)</option>
                    {STAGES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                </td>
                <td>
                  <span className={`badge ${m.status === 'ACTIVE' ? 'ok' : 'mute'}`}>{m.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {members.length === 0 ? <p className="muted">No members found.</p> : null}
      </div>
      {openMemberId ? <MemberDrawer memberId={openMemberId} onClose={() => setOpenMemberId(null)} /> : null}
    </div>
  );
}
