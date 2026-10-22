'use client';
// Church settings: age brackets (demographics) + toggles + SMS gateway card,
// R4 customisation: profile/branding, funds, fees, care alerts, SMS locales.
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import {
  BUILTIN_SMS_TEMPLATES,
  DENOMINATION_PRESETS,
  SMS_LOCALES,
  SMS_LOCALE_LABELS,
  SMS_TEMPLATE_KEYS,
  SMS_TEMPLATE_VARS,
} from '@chms/shared';

interface Bracket {
  key: string;
  label: string;
  minAge: number;
  maxAge: number | null;
  genderSplit: boolean;
  segmentKey: string;
  isActive?: boolean;
}

const DEFAULT_BRACKETS: Bracket[] = [
  { key: 'TODDLERS', label: 'Nursery & Toddlers', minAge: 0, maxAge: 4, genderSplit: false, segmentKey: 'TODDLERS' },
  { key: 'CHILDREN', label: 'Children Ministry', minAge: 5, maxAge: 12, genderSplit: false, segmentKey: 'CHILDREN' },
  { key: 'TEENS', label: 'Teens Chapel', minAge: 13, maxAge: 19, genderSplit: false, segmentKey: 'TEENS' },
  { key: 'YOUNG_ADULTS', label: 'Young Adults', minAge: 20, maxAge: 35, genderSplit: false, segmentKey: 'YOUNG_ADULTS' },
  { key: 'ADULTS', label: 'Main Sanctuary Adults', minAge: 36, maxAge: 59, genderSplit: true, segmentKey: 'ADULTS' },
  { key: 'SENIORS', label: 'Golden Age Fellowship', minAge: 60, maxAge: null, genderSplit: false, segmentKey: 'SENIORS' },
];

export default function SettingsPage() {
  const [brackets, setBrackets] = useState<Bracket[]>(DEFAULT_BRACKETS);
  const [toggles, setToggles] = useState({ autoAssignHeadcount: true, autoPromote: false, capacity: 0 });
  const [gw, setGw] = useState<any>(null);
  const [dev, setDev] = useState({ enabled: false, translation: 'kjv', verse: 'John 3:16' });
  // Church customisation: name/logo/branding, contact, giving instructions, funds, fees.
  const [prof, setProf] = useState<any>({ name: '', pastorDisplayName: '', smsSenderId: '', branding: {}, contact: {}, givingInstructions: {} });
  const [funds, setFunds] = useState<any[]>([]);
  const [newFund, setNewFund] = useState({ name: '', type: 'OFFERING' });
  const [fees, setFees] = useState<any>({ feeMode: 'CHURCH_ABSORBS', feeBps: 195, feeFlatMinor: 10, feeCapMinor: null, feeDefaultOptIn: true });
  // R4.3 SMS template locales (Twi/Ga/Ewe/Fante) with English fallback.
  const [smsLoc, setSmsLoc] = useState<{ defaultLocale: string; templates: Record<string, Record<string, string>> }>({ defaultLocale: 'en', templates: {} });
  const [locKey, setLocKey] = useState('tw');
  // R4.10 denomination terminology pack.
  const [denomKey, setDenomKey] = useState('DEFAULT');
  const [terms, setTerms] = useState<{ unit: string; unitPlural: string; unitLeader: string; gathering: string; leadershipBody: string } | null>(null);
  const [gwForm, setGwForm] = useState({ mode: 'mock', label: '', url: '', authHeader: 'Authorization', authValue: '', bodyTemplate: '{"to":"{to}","message":"{message}"}', idPath: 'id', confirmed: false });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  // grouped settings: church setup (identity/logo/policy) vs SMS vs giving
  const [tab, setTab] = useState<'church' | 'sms' | 'giving'>('church');

  useEffect(() => {
    void api<(Bracket & { isActive?: boolean })[]>('/demographics/brackets').then((b) => b.length && setBrackets(b)).catch(() => undefined);
    void api<{ autoAssignHeadcount: boolean; autoPromote: boolean; capacity: number }>('/demographics/settings').then(setToggles).catch(() => undefined);
    void api<{ source: string; config: any; presets: any }>('/settings/sms-gateway').then((r) => {
      setGw(r);
      if (r.config) {
        setGwForm({
          mode: r.config.mode, label: r.config.label, url: r.config.url, authHeader: r.config.authHeader,
          authValue: '', bodyTemplate: r.config.bodyTemplate, idPath: r.config.idPath, confirmed: r.config.confirmed,
        });
      }
    }).catch(() => undefined);
    void api<{ enabled: boolean; translation: string; verse: string }>('/churches/me/devotional').then(setDev).catch(() => undefined);
    void api<any>('/churches/me/profile').then((p) => {
      setProf(p);
      if (p.branding?.primaryColor) document.documentElement.style.setProperty('--brand', p.branding.primaryColor);
      if (p.smsLocales) setSmsLoc({ defaultLocale: p.smsLocales.defaultLocale ?? 'en', templates: p.smsLocales.templates ?? {} });
      if (p.denomination) { setDenomKey(p.denomination.key ?? 'DEFAULT'); setTerms(p.denomination.terms ?? null); }
    }).catch(() => undefined);
    void api<any[]>('/giving/funds/all').then(setFunds).catch(() => undefined);
    void api<any>('/giving/settings').then((s) => s && setFees(s)).catch(() => undefined);
  }, []);

  async function saveProfile(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      const p = await api<any>('/churches/me/profile', { method: 'POST', body: prof });
      setProf(p);
      if (p.branding?.primaryColor) document.documentElement.style.setProperty('--brand', p.branding.primaryColor);
      setNotice('Church profile saved — name, logo, contact and giving instructions apply across app, login and give pages.');
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'profile save failed');
    }
  }

  function onLogoFile(file: File | undefined): void {
    if (!file) return;
    if (file.size > 300_000) { setError('Logo must be under ~300KB — try a smaller PNG/SVG.'); return; }
    const fr = new FileReader();
    fr.onload = () => setProf((p: any) => ({ ...p, branding: { ...p.branding, logoDataUrl: String(fr.result) } }));
    fr.readAsDataURL(file);
  }

  async function saveFundRow(f: any): Promise<void> {
    try {
      await api('/giving/funds', { method: 'POST', body: { id: f.id, name: f.name, type: f.type, isActive: f.isActive } });
      setFunds(await api<any[]>('/giving/funds/all'));
      setNotice(`Fund "${f.name}" saved.`);
      setError('');
    } catch (err) { setError(err instanceof Error ? err.message : 'fund save failed'); }
  }

  async function addFund(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!newFund.name.trim()) return;
    try {
      await api('/giving/funds', { method: 'POST', body: newFund });
      setFunds(await api<any[]>('/giving/funds/all'));
      setNewFund({ name: '', type: 'OFFERING' });
      setNotice('Fund added.');
      setError('');
    } catch (err) { setError(err instanceof Error ? err.message : 'add failed'); }
  }

  async function saveFees(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      const body = { ...fees, feeBps: Number(fees.feeBps), feeFlatMinor: Number(fees.feeFlatMinor), feeCapMinor: fees.feeCapMinor === null || fees.feeCapMinor === '' ? null : Number(fees.feeCapMinor) };
      await api('/giving/settings', { method: 'POST', body });
      setNotice('Giving fee model saved — applies to future online-giving quotes.');
      setError('');
    } catch (err) { setError(err instanceof Error ? err.message : 'fee save failed'); }
  }

  async function saveSmsLocales(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await api('/churches/me/profile', { method: 'POST', body: { smsLocales: smsLoc } });
      setNotice(`SMS templates saved — sending locale: ${SMS_LOCALE_LABELS[smsLoc.defaultLocale as keyof typeof SMS_LOCALE_LABELS] ?? smsLoc.defaultLocale} (English fallback per template).`);
      setError('');
    } catch (err) { setError(err instanceof Error ? err.message : 'SMS locale save failed'); }
  }

  function updLocaleTemplate(key: string, text: string): void {
    setSmsLoc({
      ...smsLoc,
      templates: { ...smsLoc.templates, [locKey]: { ...(smsLoc.templates[locKey] ?? {}), [key]: text } },
    });
  }

  async function saveDenomination(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      const p = await api<any>('/churches/me/profile', { method: 'POST', body: { denominationKey: denomKey } });
      if (p.denomination) setTerms(p.denomination.terms);
      setNotice(`Denomination preset applied — "${DENOMINATION_PRESETS.find((d) => d.key === denomKey)?.label}" labels now show across branches & services.`);
      setError('');
    } catch (err) { setError(err instanceof Error ? err.message : 'preset save failed'); }
  }

  async function saveDevotional(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await api('/churches/me/devotional', { method: 'POST', body: dev });
      setNotice(`Verse-of-the-day ${dev.enabled ? 'ON' : 'off'} — daily 05:55 SMS to opted-in members.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'save failed');
    }
  }

  async function saveAll(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await api('/demographics/brackets', { method: 'PUT', body: { brackets } });
      await api('/demographics/settings', { method: 'PUT', body: toggles });
      setNotice('Demographics saved — headcount sections synced.');
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'save failed');
    }
  }

  async function saveGateway(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await api('/settings/sms-gateway', { method: 'PUT', body: gwForm });
      setNotice('Gateway saved — the worker picks it up within a minute (no restart).');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'gateway save failed');
    }
  }

  function upd(i: number, patch: Partial<Bracket>): void {
    setBrackets(brackets.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  }

  return (
    <div>
      <h1>Settings</h1>
      {notice ? <div className="card" style={{ borderColor: 'var(--accent)' }}>{notice}</div> : null}
      {error ? <div className="error">{error}</div> : null}

      <div className="seg-toggle" style={{ margin: '0.4rem 0 1rem', flexWrap: 'wrap' }} role="tablist" aria-label="Settings sections">
        {([
          ['church', 'Church setup', 'Logo, church identity & tagline, denomination, demographics, giving instructions, retention and alerts'],
          ['sms', 'SMS setup', 'SMS gateway & sender ID, verse-of-the-day, and Twi/Ga/Ewe/Fante message templates'],
          ['giving', 'Giving', 'Giving categories (funds) and the online-giving fee model'],
        ] as const).map(([key, label, hint]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            title={hint}
            className={tab === key ? 'on' : 'secondary'}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="muted" style={{ marginTop: '-0.5rem' }}>
        {tab === 'church'
          ? 'Logo, church identity, denomination, demographics, giving instructions, retention & alerts.'
          : tab === 'sms'
            ? 'Gateway, sender, verse-of-the-day and Twi/Ga/Ewe/Fante message templates.'
            : 'Giving categories (funds) and the online-giving fee model.'}
      </p>

      <form className="card stack" onSubmit={saveAll} hidden={tab !== 'church'}>
        <h2>Age brackets (demographics)</h2>
        <p className="muted">Brackets drive check-in auto-sorting and headcount sections. Age recalculates from DOB in real time.</p>
        {brackets.map((b, i) => (
          <div className="row" key={b.key}>
            <input style={{ flex: 2 }} value={b.label} onChange={(e) => upd(i, { label: e.target.value })} />
            <input style={{ width: 110 }} value={b.key} onChange={(e) => upd(i, { key: e.target.value, segmentKey: e.target.value })} placeholder="KEY" />
            <input style={{ width: 70 }} type="number" value={b.minAge} onChange={(e) => upd(i, { minAge: Number(e.target.value) })} />
            <span>to</span>
            <input style={{ width: 70 }} type="number" value={b.maxAge ?? ''} placeholder="∞" onChange={(e) => upd(i, { maxAge: e.target.value === '' ? null : Number(e.target.value) })} />
            <label style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={b.genderSplit} onChange={(e) => upd(i, { genderSplit: e.target.checked })} />
              M/W split
            </label>
          </div>
        ))}
        <button className="secondary" type="button" onClick={() => setBrackets([...brackets, { key: `BRACKET_${brackets.length + 1}`, label: 'New bracket', minAge: 0, maxAge: null, genderSplit: false, segmentKey: `BRACKET_${brackets.length + 1}` }])}>
          + Add bracket
        </button>
        <h2>Toggles</h2>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={toggles.autoAssignHeadcount} onChange={(e) => setToggles({ ...toggles, autoAssignHeadcount: e.target.checked })} />
          Auto-sort check-ins into age-bracket headcount sections
        </label>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={toggles.autoPromote} onChange={(e) => setToggles({ ...toggles, autoPromote: e.target.checked })} />
          Auto-promote age brackets nightly (audit-logged)
        </label>
        <label>
          Auditorium capacity (seats; 0 = no overcapacity alerts on headcount screen)
          <input type="number" min={0} value={toggles.capacity} onChange={(e) => setToggles({ ...toggles, capacity: Number(e.target.value) })} />
        </label>
        <button>Save demographics</button>
      </form>
      <form className="card stack" onSubmit={saveGateway} hidden={tab !== 'sms'}>
        <h2>SMS gateway (provider-agnostic)</h2>
        <p className="muted">
          Any HTTP SMS provider works: send URL + auth header + JSON body template with {'{to} {message} {sender} {idempotencyKey}'}.
        </p>
        <div className="row">
          <button className="small secondary" type="button" onClick={() => setGwForm({ ...gwForm, mode: 'mock', label: 'Mock', url: '', confirmed: true })}>Mock (dev)</button>
          <button className="small secondary" type="button" onClick={() => { const p = gw?.presets?.csms; if (p) setGwForm({ ...gwForm, ...p, authValue: '' }); }}>cSMS preset</button>
          <button className="small secondary" type="button" onClick={() => setGwForm({ ...gwForm, mode: 'http', label: 'Custom provider', url: '', authHeader: 'Authorization', authValue: '', bodyTemplate: '{"to":"{to}","message":"{message}"}', confirmed: false })}>Custom</button>
          {gw?.config?.authValueMasked ? <span className="badge mute">token {gw.config.authValueMasked}</span> : null}
          {gw?.source === 'env' ? <span className="badge mute">using env defaults</span> : null}
        </div>
        <div className="row">
          <label style={{ flex: 2 }}>
            Send URL
            <input value={gwForm.url} onChange={(e) => setGwForm({ ...gwForm, url: e.target.value })} placeholder="https://provider.api/sms" />
          </label>
          <label>
            Label
            <input value={gwForm.label} onChange={(e) => setGwForm({ ...gwForm, label: e.target.value })} />
          </label>
        </div>
        <div className="row">
          <label>
            Auth header
            <input value={gwForm.authHeader} onChange={(e) => setGwForm({ ...gwForm, authHeader: e.target.value })} />
          </label>
          <label style={{ flex: 1 }}>
            API token / value (write-only, masked after save)
            <input type="password" value={gwForm.authValue} onChange={(e) => setGwForm({ ...gwForm, authValue: e.target.value })} placeholder="paste key" />
          </label>
        </div>
        <label>
          Body template (JSON)
          <textarea value={gwForm.bodyTemplate} onChange={(e) => setGwForm({ ...gwForm, bodyTemplate: e.target.value })} />
        </label>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={gwForm.confirmed} onChange={(e) => setGwForm({ ...gwForm, confirmed: e.target.checked })} />
          I confirmed the field names match my provider&apos;s documentation
        </label>
        <button>Save gateway</button>
      </form>

      <form className="card stack" onSubmit={saveDevotional} hidden={tab !== 'sms'}>
        <h2>Verse of the day (SMS)</h2>
        <p className="muted">Daily 05:55 devotional to active, consented, non-opted-out members. Uses your chosen Bible translation.</p>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={dev.enabled} onChange={(e) => setDev({ ...dev, enabled: e.target.checked })} />
          Send daily verse-of-the-day
        </label>
        <div className="row">
          <label>
            Translation (file in apps/api/data/bible/)
            <select value={dev.translation} onChange={(e) => setDev({ ...dev, translation: e.target.value })}>
              <option value="kjv">KJV</option>
              <option value="asv">ASV (1901)</option>
              <option value="twi">Twi</option>
              <option value="web">WEB</option>
            </select>
          </label>
          <label style={{ flex: 1 }}>
            Verse reference
            <input value={dev.verse} onChange={(e) => setDev({ ...dev, verse: e.target.value })} placeholder="John 3:16" />
          </label>
        </div>
        <button>Save devotional</button>
      </form>

      <form className="card stack" onSubmit={saveProfile} hidden={tab !== 'church'}>
        <h2>Church profile &amp; branding</h2>
        <p className="muted">Name, logo and primary colour show on the top bar, login, public give page and member portal. Giving instructions appear on the give page and portal home.</p>
        <div className="row">
          <label style={{ flex: 2 }}>
            Church name
            <input value={prof.name ?? ''} onChange={(e) => setProf({ ...prof, name: e.target.value })} />
          </label>
          <label>
            Pastor name
            <input value={prof.pastorDisplayName ?? ''} onChange={(e) => setProf({ ...prof, pastorDisplayName: e.target.value })} />
          </label>
        </div>
        <div className="row">
          <label>
            Logo (PNG/SVG under 300KB)
            <input type="file" accept="image/*" onChange={(e) => onLogoFile(e.target.files?.[0])} />
          </label>
          <label>
            Primary colour
            <input type="color" value={prof.branding?.primaryColor ?? '#1e3a5f'} onChange={(e) => setProf({ ...prof, branding: { ...prof.branding, primaryColor: e.target.value } })} />
          </label>
          <label style={{ flex: 1 }}>
            Tagline
            <input value={prof.branding?.tagline ?? ''} onChange={(e) => setProf({ ...prof, branding: { ...prof.branding, tagline: e.target.value } })} placeholder="A place to belong" />
          </label>
        </div>
        {prof.branding?.logoDataUrl ? (
          <div className="row" style={{ alignItems: 'center', gap: 8 }}>
            <img src={prof.branding.logoDataUrl} alt="logo" style={{ height: 40 }} />
            <button className="small secondary" type="button" onClick={() => setProf({ ...prof, branding: { ...prof.branding, logoDataUrl: null } })}>Remove logo</button>
          </div>
        ) : null}
        <div className="row">
          <label>
            Contact phone
            <input value={prof.contact?.phone ?? ''} onChange={(e) => setProf({ ...prof, contact: { ...prof.contact, phone: e.target.value } })} placeholder="+233 24 000 0000" />
          </label>
          <label>
            Email
            <input value={prof.contact?.email ?? ''} onChange={(e) => setProf({ ...prof, contact: { ...prof.contact, email: e.target.value } })} />
          </label>
        </div>
        <div className="row">
          <label style={{ flex: 2 }}>
            Address
            <input value={prof.contact?.address ?? ''} onChange={(e) => setProf({ ...prof, contact: { ...prof.contact, address: e.target.value } })} placeholder="Kanda, Accra" />
          </label>
          <label>
            Social / livestream URL
            <input value={prof.contact?.socialUrl ?? ''} onChange={(e) => setProf({ ...prof, contact: { ...prof.contact, socialUrl: e.target.value } })} />
          </label>
        </div>
        <h2>Giving instructions</h2>
        <div className="row">
          <label>
            MoMo merchant name
            <input value={prof.givingInstructions?.momoMerchant ?? ''} onChange={(e) => setProf({ ...prof, givingInstructions: { ...prof.givingInstructions, momoMerchant: e.target.value } })} />
          </label>
          <label>
            MoMo number
            <input value={prof.givingInstructions?.momoNumber ?? ''} onChange={(e) => setProf({ ...prof, givingInstructions: { ...prof.givingInstructions, momoNumber: e.target.value } })} placeholder="024 000 0000" />
          </label>
          <label>
            MoMo USSD (optional)
            <input value={prof.givingInstructions?.ussd ?? ''} onChange={(e) => setProf({ ...prof, givingInstructions: { ...prof.givingInstructions, ussd: e.target.value } })} placeholder="*170*0*1#" />
          </label>
        </div>
        <div className="row">
          <label>
            Bank name
            <input value={prof.givingInstructions?.bankName ?? ''} onChange={(e) => setProf({ ...prof, givingInstructions: { ...prof.givingInstructions, bankName: e.target.value } })} />
          </label>
          <label>
            Bank account
            <input value={prof.givingInstructions?.bankAccount ?? ''} onChange={(e) => setProf({ ...prof, givingInstructions: { ...prof.givingInstructions, bankAccount: e.target.value } })} />
          </label>
          <label>
            SMS sender ID
            <input value={prof.smsSenderId ?? ''} onChange={(e) => setProf({ ...prof, smsSenderId: e.target.value })} placeholder="CHMS / MYCHURCH" />
          </label>
        </div>
        <h2>Retention policy (Act 843 fields)</h2>
        <div className="row">
          <label>
            Keep member data (years)
            <input
              type="number"
              min={1}
              max={50}
              value={prof.retention?.memberDataYears ?? 7}
              onChange={(e) => setProf({ ...prof, retention: { ...prof.retention, memberDataYears: Number(e.target.value) } })}
            />
          </label>
          <label>
            Keep giving records (years)
            <input
              type="number"
              min={1}
              max={50}
              value={prof.retention?.transactionYears ?? 7}
              onChange={(e) => setProf({ ...prof, retention: { ...prof.retention, transactionYears: Number(e.target.value) } })}
            />
          </label>
          <span className="muted" style={{ alignSelf: 'end' }}>Stored as policy fields; archival job enforces them once live.</span>
        </div>
        <h2>Missing-member alerts (nightly 03:10)</h2>
        <p className="muted">Flags active members with no attendance in the last N Sundays (who had attended before) → care queue task + SMS digest to the numbers below.</p>
        <div className="row">
          <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={prof.care?.enabled !== false}
              onChange={(e) => setProf({ ...prof, care: { ...prof.care, enabled: e.target.checked } })}
            />
            Enabled
          </label>
          <label>
            Missed Sundays threshold
            <input
              type="number"
              min={1}
              max={12}
              value={prof.care?.missingSundays ?? 3}
              onChange={(e) => setProf({ ...prof, care: { ...prof.care, missingSundays: Number(e.target.value) } })}
            />
          </label>
          <label style={{ flex: 1 }}>
            Welfare-team digest phones (comma-separated)
            <input
              value={(prof.care?.digestPhones ?? []).join(', ')}
              onChange={(e) => setProf({ ...prof, care: { ...prof.care, digestPhones: e.target.value.split(/[,\\s]+/).filter(Boolean) } })}
              placeholder="0240000000, 0550000000"
            />
          </label>
        </div>
        <button>Save church profile</button>
      </form>

      <form className="card stack" onSubmit={addFund} hidden={tab !== 'giving'}>
        <h2>Funds (giving categories)</h2>
        <p className="muted">Seeded with Ghana-typical funds (Tithe, Offering, Welfare, Building, Missions, First Fruits, Thanksgiving, Harvest). Rename, deactivate or add your own — e.g. Church Anniversary, Special Seed.</p>
        {funds.map((f) => (
          <div className="row" key={f.id}>
            <input style={{ flex: 2 }} value={f.name} onChange={(e) => setFunds(funds.map((x) => (x.id === f.id ? { ...x, name: e.target.value } : x)))} />
            <select style={{ width: 150 }} value={f.type} onChange={(e) => setFunds(funds.map((x) => (x.id === f.id ? { ...x, type: e.target.value } : x)))}>
              {['TITHE', 'OFFERING', 'WELFARE', 'BUILDING', 'MISSIONS', 'SEED', 'EVENT', 'OTHER', 'FIRST_FRUIT', 'THANKSGIVING', 'HARVEST', 'ANNIVERSARY'].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <label style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={f.isActive} onChange={(e) => setFunds(funds.map((x) => (x.id === f.id ? { ...x, isActive: e.target.checked } : x)))} />
              active
            </label>
            <button className="small secondary" type="button" onClick={() => void saveFundRow(f)}>Save</button>
          </div>
        ))}
        <div className="row">
          <input style={{ flex: 2 }} placeholder="New fund name (e.g. Church Anniversary)" value={newFund.name} onChange={(e) => setNewFund({ ...newFund, name: e.target.value })} />
          <select value={newFund.type} onChange={(e) => setNewFund({ ...newFund, type: e.target.value })}>
            {['OFFERING', 'TITHE', 'WELFARE', 'BUILDING', 'MISSIONS', 'SEED', 'EVENT', 'OTHER', 'FIRST_FRUIT', 'THANKSGIVING', 'HARVEST', 'ANNIVERSARY'].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button className="small" type="submit">+ Add fund</button>
        </div>
      </form>

      <form className="card stack" onSubmit={saveFees} hidden={tab !== 'giving'}>
        <h2>Online giving fee model</h2>
        <p className="muted">Paystack charges 1.95% + GHS 0.10 for local cards. Choose who absorbs the fee and cap it if you like.</p>
        <div className="row">
          <label style={{ flex: 2 }}>
            Fee mode
            <select value={fees.feeMode} onChange={(e) => setFees({ ...fees, feeMode: e.target.value })}>
              <option value="CHURCH_ABSORBS">Church absorbs fee</option>
              <option value="GIVER_ABSORBS">Giver pays fee (added on top)</option>
              <option value="GIVER_CHOICE">Giver chooses at checkout</option>
            </select>
          </label>
          <label>
            Rate (%)
            <input type="number" step="0.01" value={fees.feeBps / 100} onChange={(e) => setFees({ ...fees, feeBps: Math.round(Number(e.target.value) * 100) })} />
          </label>
          <label>
            Flat fee (pesewas)
            <input type="number" value={fees.feeFlatMinor} onChange={(e) => setFees({ ...fees, feeFlatMinor: e.target.value })} />
          </label>
          <label>
            Cap (pesewas, blank = none)
            <input type="number" value={fees.feeCapMinor ?? ''} onChange={(e) => setFees({ ...fees, feeCapMinor: e.target.value === '' ? null : Number(e.target.value) })} />
          </label>
        </div>
        <button>Save fee model</button>
      </form>

      <form className="card stack" onSubmit={saveSmsLocales} hidden={tab !== 'sms'}>
        <h2>SMS templates &amp; locales</h2>
        <p className="muted">
          Per-church overrides for transactional texts in Twi/Ga/Ewe/Fante with English fallback.
          Placeholders: {'{amount} {churchName} {code} {ref} …'} — leave a field empty to keep the built-in English text.
        </p>
        <div className="row">
          <label>
            Sending locale
            <select value={smsLoc.defaultLocale} onChange={(e) => setSmsLoc({ ...smsLoc, defaultLocale: e.target.value })}>
              {SMS_LOCALES.map((l) => <option key={l} value={l}>{SMS_LOCALE_LABELS[l]}</option>)}
            </select>
          </label>
          <label>
            Editing locale
            <select value={locKey} onChange={(e) => setLocKey(e.target.value)}>
              {SMS_LOCALES.filter((l) => l !== 'en').map((l) => <option key={l} value={l}>{SMS_LOCALE_LABELS[l]}</option>)}
              <option value="en">English (override built-ins)</option>
            </select>
          </label>
        </div>
        {SMS_TEMPLATE_KEYS.map((k) => (
          <label key={k}>
            {k} <span className="muted">— vars: {SMS_TEMPLATE_VARS[k]}</span>
            <textarea
              rows={2}
              value={smsLoc.templates[locKey]?.[k] ?? ''}
              placeholder={BUILTIN_SMS_TEMPLATES[k]}
              onChange={(e) => updLocaleTemplate(k, e.target.value)}
            />
          </label>
        ))}
        <button>Save SMS templates</button>
      </form>

      <form className="card stack" onSubmit={saveDenomination} hidden={tab !== 'church'}>
        <h2>Denomination preset (R4.10)</h2>
        <p className="muted">Terminology pack — renames units and leadership labels across the app (branches page, headings). Data model stays neutral.</p>
        <div className="row">
          <label style={{ flex: 2 }}>
            Preset
            <select value={denomKey} onChange={(e) => setDenomKey(e.target.value)}>
              {DENOMINATION_PRESETS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
          </label>
          {terms ? (
            <span className="row" style={{ flex: 2, flexWrap: 'wrap' }}>
              <span className="badge mute">{terms.unitPlural}</span>
              <span className="badge mute">{terms.unitLeader}</span>
              <span className="badge mute">{terms.gathering}</span>
              <span className="badge mute">{terms.leadershipBody}</span>
            </span>
          ) : null}
        </div>
        <button>Apply preset</button>
      </form>
    </div>
  );
}
