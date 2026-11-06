'use client';
// Offerings: what came in, by category and by Sunday. The board copy is a
// branded PDF built from the three report routes the office already reads.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { fmtDate, fmtDateTime, ghs } from '../../../lib/format';
import type { PdfBlock, PdfDoc } from '../../../lib/pdf';
import { sharePdf } from '../../../lib/share';
import { hasPermission } from '../../../lib/access';
import { peekSession } from '../../../lib/session';
import Notice from '../../../components/notice';

interface FundReport {
  fund: string;
  totalMinor: number;
  count: number;
}

interface TransactionRow {
  id: string;
  reference: string;
  giftMinor: number;
  status: string;
  channel: string | null;
  paidAt: string | null;
  fund?: { name: string };
}

interface DayReport { date: string; totalMinor: number; count: number }
interface ChannelReport { channel: string | null; totalMinor: number; count: number }
interface GiverReport { name: string; memberNo: string | null; totalMinor: number; count: number }
interface AnalyticsReport {
  days: number;
  daily: DayReport[];
  channels: ChannelReport[];
  topGivers: GiverReport[];
  privateGiven: { totalMinor: number; count: number };
}

/** The words the ledger's channel codes are read in. */
function channelLabel(channel: string | null): string {
  if (!channel) return 'Recorded by hand';
  if (channel === 'MOBILE_MONEY') return 'Mobile money';
  if (channel === 'CARD') return 'Card';
  if (channel === 'BANK') return 'Bank transfer';
  if (channel === 'CASH') return 'Cash';
  return channel;
}

export default function FinancePage() {
  const [report, setReport] = useState<FundReport[]>([]);
  const [txs, setTxs] = useState<TransactionRow[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  // The board report is the same three routes the screen reads, so the button
  // appears only for the roles the API would actually answer.
  const [canReport, setCanReport] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, t] = await Promise.all([
        api<FundReport[]>('/finance/reports/by-fund'),
        api<TransactionRow[]>('/giving/transactions?limit=50'),
      ]);
      setReport(r);
      setTxs(t);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load');
    }
  }, []);

  useEffect(() => {
    void load();
    setCanReport(hasPermission(peekSession()?.permissions ?? [], 'reports:read'));
  }, [load]);

  const totalGiven = report.reduce((a, r) => a + r.totalMinor, 0);

  /** One document: the funds, the Sundays, and how the money actually arrived. */
  function reportDoc(funds: FundReport[], sundays: DayReport[], stats: AnalyticsReport): PdfDoc {
    const given = funds.reduce((a, f) => a + f.totalMinor, 0);
    const blocks: PdfBlock[] = [
      {
        kind: 'fields',
        rows: [
          { label: 'Total given', value: ghs(given), bold: true },
          { label: 'Categories', value: String(funds.length) },
          { label: 'Sundays with giving', value: String(sundays.length) },
          { label: 'Covered by the trend', value: `Last ${stats.days} days` },
        ],
      },
      { kind: 'heading', text: 'By category', spaceBefore: 10 },
      {
        kind: 'table',
        columns: [{ label: 'Category', grow: 3 }, { label: 'Entries', grow: 1.4, align: 'right' }, { label: 'Total', grow: 2, align: 'right' }],
        rows: [...funds.map((f) => [f.fund, String(f.count), ghs(f.totalMinor)]), ['Total', String(funds.reduce((a, f) => a + f.count, 0)), ghs(given)]],
      },
      { kind: 'heading', text: 'By Sunday', spaceBefore: 10 },
      {
        kind: 'table',
        columns: [{ label: 'Date', grow: 2 }, { label: 'Gifts', grow: 1.4, align: 'right' }, { label: 'Total', grow: 2, align: 'right' }],
        rows: sundays.map((s) => [fmtDate(s.date), String(s.count), ghs(s.totalMinor)]),
      },
      { kind: 'heading', text: 'How it came in', spaceBefore: 10 },
      {
        kind: 'table',
        columns: [{ label: 'Way of giving', grow: 3 }, { label: 'Gifts', grow: 1.4, align: 'right' }, { label: 'Total', grow: 2, align: 'right' }],
        rows: stats.channels.map((c) => [channelLabel(c.channel), String(c.count), ghs(c.totalMinor)]),
      },
      { kind: 'heading', text: `Who gave in the last ${stats.days} days`, spaceBefore: 10 },
      {
        kind: 'table',
        columns: [
          { label: 'Name', grow: 3 },
          { label: 'Number', grow: 1.5 },
          { label: 'Gifts', grow: 1.1, align: 'right' },
          { label: 'Total', grow: 1.8, align: 'right' },
        ],
        rows: stats.topGivers.map((g) => [g.name, g.memberNo ?? 'Not on the book', String(g.count), ghs(g.totalMinor)]),
      },
      {
        kind: 'text',
        muted: true,
        size: 9,
        spaceBefore: 6,
        text: `Every gift in the table carries a name from the giving record — a member of this church or a visitor who gave their name. ${
          stats.privateGiven.count
            ? `${stats.privateGiven.count} gift${stats.privateGiven.count === 1 ? '' : 's'} totalling ${ghs(stats.privateGiven.totalMinor)} were marked private and are counted without a name.`
            : 'No gift in this period was marked private.'
        }`,
      },
      {
        kind: 'text',
        muted: true,
        size: 9,
        spaceBefore: 14,
        text: 'Only gifts the bank or the service has confirmed are counted. Cash taken at the door is added when the office records it.',
      },
    ];
    return {
      title: 'Offerings report',
      subtitle: `Prepared ${fmtDate(new Date())} · last ${stats.days} days of giving`,
      blocks,
      footnote: `Confirmed gifts only. ${txs.length ? `The app also holds ${txs.length} of the newest entries, including any still waiting.` : ''}`,
    };
  }

  async function downloadReport(): Promise<void> {
    setBusy(true);
    setNotice('');
    setError('');
    try {
      const [funds, sundays, stats] = await Promise.all([
        api<FundReport[]>('/finance/reports/by-fund'),
        api<DayReport[]>('/finance/reports/by-sunday'),
        api<AnalyticsReport>('/finance/reports/analytics?days=90'),
      ]);
      const result = await sharePdf({
        church: peekSession()?.church,
        doc: reportDoc(funds, sundays, stats),
        filename: `offerings-${new Date().toISOString().slice(0, 10)}.pdf`,
        title: 'Offerings report',
        text: `Offerings: ${ghs(funds.reduce((a, f) => a + f.totalMinor, 0))}`,
      });
      if (result.kind === 'failed') setError(result.message);
      else if (result.message) setNotice(result.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not build the report');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1>Offerings</h1>
      {notice ? <Notice text={notice} onDone={() => setNotice('')} /> : null}
      {error ? <Notice kind="error" text={error} onDone={() => setError('')} /> : null}

      <div className="card">
        <div className="spread">
          <h2>By category</h2>
          {canReport ? (
            <button className="small" onClick={() => void downloadReport()} disabled={busy}>
              {busy ? 'Preparing...' : 'Report for the board'}
            </button>
          ) : null}
        </div>
        <table>
          <tbody>
            {report.map((r) => (
              <tr key={r.fund}>
                <td>{r.fund}</td>
                <td className="muted">{r.count} entries</td>
                <td style={{ textAlign: 'right' }}>{ghs(r.totalMinor)}</td>
              </tr>
            ))}
            <tr>
              <td><strong>Total</strong></td>
              <td />
              <td style={{ textAlign: 'right' }}><strong>{ghs(totalGiven)}</strong></td>
            </tr>
          </tbody>
        </table>
        {report.length === 0 ? <p className="muted">No offerings recorded yet.</p> : null}
      </div>

      <div className="card">
        <h2>Recent offerings</h2>
        <table>
          <thead>
            <tr>
              <th>Reference</th>
              <th>Category</th>
              <th>Amount</th>
              <th>Channel</th>
              <th>Status</th>
              <th>Paid</th>
            </tr>
          </thead>
          <tbody>
            {txs.map((t) => (
              <tr key={t.id}>
                <td className="muted">{t.reference.slice(0, 18)}…</td>
                <td>{t.fund?.name ?? '—'}</td>
                <td>{ghs(t.giftMinor)}</td>
                <td>{t.channel ?? '—'}</td>
                <td>
                  <span className={`badge ${t.status === 'SUCCESS' ? 'ok' : t.status === 'PENDING' ? 'warn' : 'err'}`}>
                    {t.status}
                  </span>
                </td>
                <td>{fmtDateTime(t.paidAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {txs.length === 0 ? <p className="muted">Nothing here yet — online offerings and MOBILE MONEY transfers appear automatically.</p> : null}
      </div>
    </div>
  );
}
