'use client';
// Projection screen (SSE live) + worship tools: song library (CCLI-gated
// lyrics) and setlists for the service.
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api';

interface Service { id: string; name: string; status: string }
interface Song { id: string; title: string; author?: string; ccliNumber?: string }
interface Setlist { id: string; name: string; songIds: string[] }

export default function MediaPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [serviceId, setServiceId] = useState('');
  const [totals, setTotals] = useState<{ label: string; net: number }[]>([]);
  const [netTotal, setNetTotal] = useState(0);
  const [full, setFull] = useState(false);
  const [songs, setSongs] = useState<Song[]>([]);
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [songForm, setSongForm] = useState({ title: '', author: '', ccliNumber: '', lyrics: '', lyricsLicensed: false });
  const [slName, setSlName] = useState('');
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    void api<Service[]>('/services').then((list) => {
      setServices(list);
      const open = list.find((s) => s.status === 'OPEN') ?? list[0];
      if (open) setServiceId(open.id);
    });
    void api<Song[]>('/songs').then(setSongs).catch(() => undefined);
    void api<Setlist[]>('/setlists').then(setSetlists).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!serviceId) return;
    const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
    const es = new EventSource(`${base}/headcount/stream?serviceId=${serviceId}`);
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.totals) {
          setTotals(data.totals.filter((t: { segmentKey: string }) => t.segmentKey !== 'LIVESTREAM'));
          setNetTotal(data.netTotal);
        }
      } catch { /* keep last frame */ }
    };
    return () => es.close();
  }, [serviceId]);

  async function addSong(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await api('/songs', { method: 'POST', body: songForm });
      setSongForm({ title: '', author: '', ccliNumber: '', lyrics: '', lyricsLicensed: false });
      setSongs(await api<Song[]>('/songs'));
    } catch { /* list refresh shows outcome */ }
  }

  async function saveSetlist(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await api('/setlists', { method: 'POST', body: { name: slName, serviceId: serviceId || undefined, songIds: picked } });
      setSlName(''); setPicked([]);
      setSetlists(await api<Setlist[]>('/setlists'));
    } catch { /* ignore */ }
  }

  return (
    <div>
      {!full ? (
        <div className="card">
          <div className="spread">
            <h1 style={{ margin: 0 }}>Projection screen</h1>
            <button onClick={() => setFull(true)}>Fullscreen</button>
          </div>
          <label>Service
            <select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              {services.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.status})</option>)}
            </select>
          </label>
          <p className="muted">Live counters update every 5s via SSE — cast this tab to the sanctuary screen.</p>
        </div>
      ) : null}
      <div className={full ? 'media-screen' : 'card'} style={full ? {} : { marginTop: '0.6rem' }}>
        {full ? (
          <a href="#exit" style={{ position: 'fixed', top: 12, right: 16, color: '#fff', opacity: 0.6 }} onClick={(e) => { e.preventDefault(); setFull(false); }}>exit ✕</a>
        ) : null}
        <div className={full ? 'big' : ''} style={full ? {} : { fontSize: '2.6rem', fontWeight: 800, textAlign: 'center' }}>{netTotal}</div>
        <div className={full ? '' : 'muted'}>{full ? 'IN THE HOUSE' : 'total attendance'}</div>
        <div className={full ? 'cols' : 'row'} style={full ? {} : { justifyContent: 'center', gap: '1.4rem', marginTop: '0.6rem' }}>
          {totals.map((t) => (
            <div className={full ? 'col' : ''} key={t.label} style={full ? {} : { textAlign: 'center' }}>
              <div className={full ? 'n' : ''} style={full ? {} : { fontSize: '1.6rem', fontWeight: 700 }}>{t.net}</div>
              <div className={full ? 'l' : 'muted'} style={full ? {} : { fontSize: '0.8rem' }}>{t.label}</div>
            </div>
          ))}
        </div>
      </div>
      {!full ? (
        <div className="grid cols-2" style={{ marginTop: '0.6rem' }}>
          <div className="card">
            <h2>Song library (worship companion)</h2>
            <form className="stack" onSubmit={addSong}>
              <div className="row">
                <input placeholder="Title" value={songForm.title} onChange={(e) => setSongForm({ ...songForm, title: e.target.value })} required style={{ flex: 1 }} />
                <input placeholder="Author" value={songForm.author} onChange={(e) => setSongForm({ ...songForm, author: e.target.value })} style={{ flex: 1 }} />
                <input placeholder="CCLI #" value={songForm.ccliNumber} onChange={(e) => setSongForm({ ...songForm, ccliNumber: e.target.value })} style={{ width: 90 }} />
              </div>
              <textarea placeholder="Lyrics — only store if your church holds a CCLI licence" value={songForm.lyrics} onChange={(e) => setSongForm({ ...songForm, lyrics: e.target.value })} />
              <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={songForm.lyricsLicensed} onChange={(e) => setSongForm({ ...songForm, lyricsLicensed: e.target.checked })} />
                Our church holds a CCLI licence covering these lyrics
              </label>
              <button>Add song</button>
            </form>
            <table><tbody>
              {songs.map((s) => (
                <tr key={s.id}>
                  <td>{s.title}</td>
                  <td className="muted">{s.author ?? ''}</td>
                  <td>{s.ccliNumber ? <span className="badge mute">CCLI {s.ccliNumber}</span> : null}</td>
                </tr>
              ))}
            </tbody></table>
          </div>
          <div className="card">
            <h2>Setlists</h2>
            <form className="stack" onSubmit={saveSetlist}>
              <input placeholder="Setlist name (e.g. Sunday 1st Service)" value={slName} onChange={(e) => setSlName(e.target.value)} required />
              <div className="row">
                {songs.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`small ${picked.includes(s.id) ? '' : 'secondary'}`}
                    onClick={() => setPicked(picked.includes(s.id) ? picked.filter((id) => id !== s.id) : [...picked, s.id])}
                  >
                    {s.title}
                  </button>
                ))}
                {songs.length === 0 ? <span className="muted">Add songs first.</span> : null}
              </div>
              <button>Save setlist ({picked.length} songs)</button>
            </form>
            {setlists.map((sl) => (
              <div key={sl.id} className="card" style={{ marginTop: 8, background: 'var(--bg)' }}>
                <strong>{sl.name}</strong>
                <div className="muted">{sl.songIds.length} songs · {sl.songIds.map((id) => songs.find((s) => s.id === id)?.title ?? '…').join(' → ')}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

    </div>
  );
}
