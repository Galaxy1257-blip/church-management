'use client';
// One member profile that opens anywhere a person is named: Members, care
// queue, missing-member tasks, announcements and the dashboard. It shows the
// contact and location details the office needs to follow up, plus groups and
// open care tasks.
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { fmtDate, fmtDateTime } from '../lib/format';

export interface MemberGroup {
  id: string;
  name: string;
  type: string;
  role: string;
  leaderName: string | null;
}

interface MemberDetail {
  id: string;
  memberNo: string;
  firstName: string;
  lastName: string;
  phoneE164: string | null;
  email: string | null;
  address: string | null;
  gender: 'MALE' | 'FEMALE' | null;
  status: string;
  dob: string | null;
  joinedAt: string | null;
  ageSegment: string | null;
  photoDataUrl: string | null;
  smsConsent: boolean;
  lastCheckIn: string | null;
  groups: MemberGroup[];
  careTasks: { id: string; type: string; status: string; dueAt: string; note: string | null }[];
  announcements: { id: string; title: string; category: string; publishAt: string; photoDataUrl: string | null }[];
}

export default function MemberDrawer({
  memberId,
  onClose,
}: {
  memberId: string;
  onClose: () => void;
}) {
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setMember(null);
    setError('');
    api<MemberDetail>(`/members/${memberId}`)
      .then((m) => live && setMember(m))
      .catch((e) => live && setError(e instanceof Error ? e.message : 'could not load this member'));
    return () => {
      live = false;
    };
  }, [memberId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <>
      <button type="button" className="drawer-scrim" aria-label="Close member details" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Member details">
        <div className="drawer-head">
          {member?.photoDataUrl ? (
            <img className="avatar avatar-lg" src={member.photoDataUrl} alt={`${member.firstName} ${member.lastName}`} />
          ) : (
            <span className="avatar avatar-lg" aria-hidden>
              {member ? `${member.firstName[0] ?? ''}${member.lastName[0] ?? ''}`.toUpperCase() : '·'}
            </span>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0 }}>
              {member ? `${member.firstName} ${member.lastName}` : 'Member details'}
            </h2>
            {member ? (
              <div className="muted" style={{ fontSize: '0.82rem' }}>
                No. {member.memberNo}
                {member.ageSegment ? ` · ${member.ageSegment}` : ''}
              </div>
            ) : null}
          </div>
          <button type="button" className="small secondary" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="drawer-body">
          {error ? <div className="error">{error}</div> : null}
          {!member && !error ? <p className="muted">Loading…</p> : null}
          {member ? (
            <>
              <div className="row">
                <span className={`badge ${member.status === 'ACTIVE' ? 'ok' : 'mute'}`}>{member.status.toLowerCase()}</span>
                {member.gender ? <span className="badge mute">{member.gender === 'MALE' ? 'Male' : 'Female'}</span> : null}
                {member.smsConsent ? <span className="badge mute">SMS yes</span> : <span className="badge warn">no SMS</span>}
                <span className="muted" style={{ fontSize: '0.8rem' }}>
                  {member.lastCheckIn ? `Last seen ${fmtDate(member.lastCheckIn)}` : 'Not checked in yet'}
                </span>
              </div>

              <div className="drawer-section">
                <h3>Contact</h3>
                {member.phoneE164 ? (
                  <div className="row">
                    <a href={`tel:${member.phoneE164}`}>{member.phoneE164}</a>
                    <a className="small-link" href={`sms:${member.phoneE164}`}>Text</a>
                  </div>
                ) : (
                  <p className="muted">No phone number on file.</p>
                )}
                {member.email ? <p><a href={`mailto:${member.email}`}>{member.email}</a></p> : null}
              </div>

              <div className="drawer-section">
                <h3>Location</h3>
                <p>{member.address?.trim() || <span className="muted">No address on file yet.</span>}</p>
              </div>

              <div className="drawer-section">
                <h3>Groups</h3>
                {member.groups.length ? (
                  <div className="chip-scroll">
                    {member.groups.map((g) => (
                      <span key={g.id} className="badge mute">
                        {g.name}
                        {g.leaderName ? ` · led by ${g.leaderName}` : ''}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="muted">Not in a group yet — add them from Groups.</p>
                )}
              </div>

              <div className="drawer-section">
                <h3>Following up</h3>
                {member.careTasks.length ? (
                  member.careTasks.map((t) => (
                    <div key={t.id} className="counter">
                      <span className="badge warn">{t.type.replace(/_/g, ' ').toLowerCase()}</span>
                      <span className="name" style={{ fontSize: '0.9rem' }}>{t.note || 'Open task'}</span>
                      <span className="muted" style={{ fontSize: '0.78rem' }}>due {fmtDate(t.dueAt)}</span>
                    </div>
                  ))
                ) : (
                  <p className="muted">No open care tasks.</p>
                )}
              </div>

              {member.announcements.length ? (
                <div className="drawer-section">
                  <h3>Notices about this member</h3>
                  {member.announcements.map((a) => (
                    <div key={a.id} className="counter">
                      <span className="badge mute">{a.category.toLowerCase()}</span>
                      <span className="name" style={{ fontSize: '0.9rem' }}>{a.title}</span>
                      <span className="muted" style={{ fontSize: '0.78rem' }}>{fmtDateTime(a.publishAt)}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="drawer-section">
                <h3>Joined</h3>
                <p className="muted">{member.joinedAt ? fmtDate(member.joinedAt) : '—'}</p>
              </div>
            </>
          ) : null}
        </div>
      </aside>
    </>
  );
}
