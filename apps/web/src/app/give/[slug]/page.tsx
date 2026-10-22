'use client';
import { FormEvent, use, useEffect, useState } from 'react';
import { apiRaw } from '../../../lib/api';
import { ghs, toPesewas } from '../../../lib/format';

interface ChurchPublic {
  id?: string;
  name: string;
  slug: string;
  pastorDisplayName: string | null;
  smsSenderId?: string | null;
  branding?: { logoDataUrl?: string | null; tagline?: string; primaryColor?: string } | null;
  givingInstructions?: { momoMerchant?: string; momoNumber?: string; ussd?: string; bankName?: string; bankAccount?: string } | null;
  funds: { id: string; name: string; type: string }[];
}

interface Quote {
  giftMinor: number;
  feeMinor: number;
  feeCoverMinor: number;
  chargedMinor: number;
  netToFundMinor: number;
}

export default function GivePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [church, setChurch] = useState<ChurchPublic | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [fundId, setFundId] = useState('');
  const [amount, setAmount] = useState('');
  const [feeChoice, setFeeChoice] = useState(false);
  const [giverName, setGiverName] = useState('');
  const [phone, setPhone] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/churches/${slug}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('not found');
        const data = (await r.json()) as ChurchPublic;
        setChurch(data);
        if (data.funds[0]) setFundId(data.funds[0].id);
        if (data.branding?.primaryColor) document.documentElement.style.setProperty('--brand', data.branding.primaryColor);
        document.title = `Give to ${data.name}`;
      })
      .catch(() => setNotFound(true));
  }, [slug]);

  async function refreshQuote(): Promise<void> {
    const pesewas = toPesewas(amount);
    if (!pesewas || !fundId) return;
    try {
      const res = await apiRaw('/giving/quote', { fundId, amountMinor: pesewas, feeChoice });
      if (res.ok) setQuote((await res.json()) as Quote);
    } catch {
      /* quote is advisory */
    }
  }

  async function give(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError('');
    const pesewas = toPesewas(amount);
    if (!pesewas || pesewas <= 0) {
      setError('Enter a valid amount (e.g. 50.00)');
      return;
    }
    setBusy(true);
    try {
      const res = await apiRaw('/giving/initialize', {
        fundId,
        amountMinor: pesewas,
        feeChoice,
        giverName: giverName || undefined,
        giverPhoneE164: phone || undefined,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? 'could not start payment');
      window.location.href = body.authorizationUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'payment failed to start');
      setBusy(false);
    }
  }

  if (notFound) return <div className="container">Church not found.</div>;
  if (!church) return <div className="container">Loading…</div>;

  return (
    <div className="container" style={{ maxWidth: 460, paddingTop: '6vh' }}>
      <div className="card">
        {church.branding?.logoDataUrl ? (
          <img src={church.branding.logoDataUrl} alt={`${church.name} logo`} style={{ height: 56, margin: '0 auto 0.5rem', display: 'block' }} />
        ) : null}
        <h1>Give to {church.name}</h1>
        <p className="muted">
          {church.branding?.tagline ? `${church.branding.tagline} · ` : ''}
          Mobile money &amp; card via Paystack. You&apos;ll get an SMS receipt.
        </p>
        <form className="stack" onSubmit={give}>
          <label>
            Fund
            <select value={fundId} onChange={(e) => setFundId(e.target.value)} required>
              {church.funds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Amount (GHS)
            <input
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                void refreshQuote();
              }}
              inputMode="decimal"
              placeholder="50.00"
              required
            />
          </label>
          <label>
            <span className="row" style={{ gap: '0.4rem' }}>
              <input
                type="checkbox"
                checked={feeChoice}
                onChange={(e) => {
                  setFeeChoice(e.target.checked);
                  void refreshQuote();
                }}
              />
              Cover the processing fee (so the church receives the full amount)
            </span>
          </label>
          <label>
            Name (optional)
            <input value={giverName} onChange={(e) => setGiverName(e.target.value)} />
          </label>
          <label>
            Phone for receipt (optional)
            <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
          </label>
          {quote ? (
            <div className="card" style={{ marginBottom: 0, background: 'var(--bg)' }}>
              <div className="spread">
                <span>You pay</span>
                <strong>{ghs(quote.chargedMinor)}</strong>
              </div>
              <div className="spread muted">
                <span>Church receives</span>
                <span>{ghs(quote.netToFundMinor)}</span>
              </div>
            </div>
          ) : null}
          {error ? <div className="error">{error}</div> : null}
          <button disabled={busy}>{busy ? 'Starting…' : 'Give securely'}</button>
        </form>
      </div>
      {church.givingInstructions && (church.givingInstructions.momoNumber || church.givingInstructions.bankAccount) ? (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h2 style={{ fontSize: '1rem' }}>Other ways to give</h2>
          {church.givingInstructions.momoNumber ? (
            <p>
              <strong>MoMo{church.givingInstructions.momoMerchant ? ` (${church.givingInstructions.momoMerchant})` : ''}:</strong>{' '}
              {church.givingInstructions.momoNumber}
              {church.givingInstructions.ussd ? ` · ${church.givingInstructions.ussd}` : ''}
            </p>
          ) : null}
          {church.givingInstructions.bankAccount ? (
            <p>
              <strong>Bank{church.givingInstructions.bankName ? ` — ${church.givingInstructions.bankName}` : ''}:</strong>{' '}
              {church.givingInstructions.bankAccount}
            </p>
          ) : null}
          <p className="muted" style={{ marginBottom: 0 }}>Use your name + fund as the transfer narrative. Confirmations are matched to members by phone.</p>
        </div>
      ) : null}
    </div>
  );
}
