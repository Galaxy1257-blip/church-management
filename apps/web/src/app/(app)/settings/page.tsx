'use client';
// Church settings: age brackets (demographics) + toggles + SMS gateway card,
// R4 customisation: profile/branding, funds, fees, care alerts, SMS locales.
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import BillingPanel from '../../../components/billing-panel';
import { clearSession } from '../../../lib/session';
import { MODULE_DEFAULTS, MODULE_KEYS, MODULE_LABELS } from '../../../lib/access';
import {
  BUILTIN_SMS_TEMPLATES,
  DENOMINATION_PRESETS,
  SMS_LOCALES,
  SMS_LOCALE_LABELS,
  SMS_TEMPLATE_KEYS,
  SMS_TEMPLATE_VARS,
} from '../../../lib/shared-constants';

interface Bracket {
  key: string;
  label: string;
  minAge: number;
  maxAge: number | null;
  genderSplit: boolean;
  maleLabel?: string | null;
  femaleLabel?: string | null;
  segmentKey: string;
  isActive?: boolean;
}

const SIMPLE_BRACKETS: Bracket[] = [
  {
    key: 'SUNDAY_SCHOOL',
    label: 'Sunday School',
    minAge: 0,
    maxAge: 12,
    genderSplit: true,
    maleLabel: 'Sunday School (Boys)',
    femaleLabel: 'Sunday School (Girls)',
    segmentKey: 'SUNDAY_SCHOOL',
  },
  { key: 'ADULTS', label: 'Adults', minAge: 13, maxAge: null, genderSplit: true, maleLabel: 'Men', femaleLabel: 'Women', segmentKey: 'ADULTS' },
];

// Optional detailed set for churches that want more than these four groups.
const DETAILED_BRACKETS: Bracket[] = [
  { key: 'TODDLERS', label: 'Nursery & Toddlers', minAge: 0, maxAge: 4, genderSplit: false, segmentKey: 'TODDLERS' },
  { key: 'CHILDREN', label: 'Children', minAge: 5, maxAge: 12, genderSplit: false, segmentKey: 'CHILDREN' },
  { key: 'TEENS', label: 'Teens', minAge: 13, maxAge: 19, genderSplit: false, segmentKey: 'TEENS' },
  { key: 'YOUNG_ADULTS', label: 'Young Adults', minAge: 20, maxAge: 35, genderSplit: false, segmentKey: 'YOUNG_ADULTS' },
  { key: 'ADULTS', label: 'Adults', minAge: 36, maxAge: 59, genderSplit: true, maleLabel: 'Men', femaleLabel: 'Women', segmentKey: 'ADULTS' },
  { key: 'SENIORS', label: 'Seniors', minAge: 60, maxAge: null, genderSplit: false, segmentKey: 'SENIORS' },
];

// One-tap occasional events. These are NOT created by default — a church adds
// the ones it actually runs, so no unused categories clutter the offering form.
const SPECIAL_EVENT_PRESETS: { name: string; type: string }[] = [
  { name: 'Church Anniversary', type: 'ANNIVERSARY' },
  { name: 'Seed Offering', type: 'SEED' },
  { name: 'Harvest', type: 'HARVEST' },
  { name: 'Thanksgiving', type: 'THANKSGIVING' },
  { name: 'First Fruits', type: 'FIRST_FRUIT' },
];

// Colour schemes. Each one is a [data-theme] block in globals.css; "night" is
// the dark mode. The choice is remembered in this browser only.
const THEMES: { key: string; name: string; hint: string; colors: string[] }[] = [
  { key: 'sanctuary', name: 'Sanctuary', hint: 'Forest green & gold', colors: ['#1f4d3a', '#c08a2e', '#b4513a', '#f5efe4'] },
  { key: 'harvest', name: 'Harvest', hint: 'Olive & wheat', colors: ['#4c5a20', '#c98a1f', '#a35427', '#f7f1df'] },
  { key: 'ocean', name: 'Ocean', hint: 'Deep blue & teal', colors: ['#114b5f', '#1f7a8c', '#c96a44', '#eaf2f4'] },
  { key: 'navy', name: 'Navy', hint: 'Royal blue & brass', colors: ['#1e3a5f', '#c9973f', '#9c3f2f', '#f2efe7'] },
  { key: 'burgundy', name: 'Burgundy', hint: 'Wine red & gold', colors: ['#6b1f2e', '#c19a4b', '#a4472f', '#f7efe9'] },
  { key: 'plum', name: 'Plum', hint: 'Aubergine & rose', colors: ['#5a2e4d', '#a8578a', '#b34a5c', '#f4ecf2'] },
  { key: 'dawn', name: 'Dawn', hint: 'Rosewood & peach', colors: ['#7a3b3b', '#d78f5c', '#a8524f', '#fbf0eb'] },
  { key: 'rosewood', name: 'Rosewood', hint: 'Dusty rose & gold', colors: ['#7a3545', '#c9a24a', '#9c5a3c', '#f7efec'] },
  { key: 'meadow', name: 'Meadow', hint: 'Leafy green & lime', colors: ['#1e5c3a', '#7fae4f', '#a8622f', '#edf4ec'] },
  { key: 'sage', name: 'Sage', hint: 'Soft green & clay', colors: ['#3f6256', '#b9793f', '#a8503e', '#f0f4ef'] },
  { key: 'sand', name: 'Sand', hint: 'Desert sand & bronze', colors: ['#6b4f2a', '#b8802f', '#a8563a', '#f7f1e3'] },
  // Cool, vivid and neutral families so the picker is not all warm earth tones.
  { key: 'sky', name: 'Sky', hint: 'Bright blue & cloud', colors: ['#1e4f8a', '#2f8fd0', '#d9633f', '#eef5fc'] },
  { key: 'mint', name: 'Mint', hint: 'Fresh teal & mint', colors: ['#0f6b5c', '#16a38c', '#d9633f', '#ecfaf5'] },
  { key: 'indigo', name: 'Indigo', hint: 'Deep indigo & periwinkle', colors: ['#3730a3', '#6366f1', '#e0663f', '#eef1ff'] },
  { key: 'violet', name: 'Violet', hint: 'Purple & lilac', colors: ['#6b21a8', '#a855f7', '#d9538a', '#f6f1fd'] },
  { key: 'coral', name: 'Coral', hint: 'Coral red & peach', colors: ['#b03a2e', '#ee6c4d', '#c2410c', '#fff1ee'] },
  { key: 'blossom', name: 'Blossom', hint: 'Pink & rose', colors: ['#9d174d', '#ec4899', '#c2410c', '#fdf1f6'] },
  { key: 'slate', name: 'Slate', hint: 'Cool grey & steel', colors: ['#2c3a4b', '#5b7a99', '#c25a44', '#f3f5f8'] },
  { key: 'night', name: 'Night', hint: 'Dark mode', colors: ['#12100d', '#2f6b52', '#e0ac52', '#f4ede1'] },
];

const THEME_KEY = 'chms.theme';

function applyTheme(key: string): void {
  if (typeof document === 'undefined') return;
  if (key === 'sanctuary') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = key;
  try {
    localStorage.setItem(THEME_KEY, key);
  } catch {
    /* private mode — the theme still applies for this visit */
  }
}

export default function SettingsPage() {
  const [brackets, setBrackets] = useState<Bracket[]>(SIMPLE_BRACKETS);
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
  // grouped settings: church setup (identity/logo/policy) vs SMS vs giving vs modules
  const [tab, setTab] = useState<'church' | 'sms' | 'giving' | 'appearance' | 'modules' | 'billing'>('church');
  const [theme, setTheme] = useState('sanctuary');
  // Which areas of the app this church runs (settings.modules; absent key =
  // the shared default for that area).
  const [modules, setModules] = useState<Record<string, boolean>>({ ...MODULE_DEFAULTS });
  // Listed as "every church" versus "opt-in", the way the office thinks about it.
  const coreKeys = MODULE_KEYS.filter((key) => MODULE_DEFAULTS[key]);
  const extraKeys = MODULE_KEYS.filter((key) => !MODULE_DEFAULTS[key]);
  const usedCount = MODULE_KEYS.filter((key) => modules[key] !== false).length;
  const unusedCount = MODULE_KEYS.length - usedCount;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved && THEMES.some((t) => t.key === saved)) setTheme(saved);
    } catch {
      /* ignore */
    }
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
      if (p.modules) setModules({ ...MODULE_DEFAULTS, ...p.modules });
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
      setNotice('Church profile saved — name, logo, contact and offering details apply across the app, login and giving page.');
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'profile save failed');
    }
  }

  /**
   * Save the module switches. The shell caches /auth/me (lib/session.ts), so the
   * nav only changes after a reload — which is the visible feedback here.
   */
  async function saveModules(): Promise<void> {
    try {
      const p = await api<any>('/churches/me/profile', { method: 'POST', body: { modules } });
      if (p.modules) setModules({ ...MODULE_DEFAULTS, ...p.modules });
      setError('');
      clearSession();
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'module save failed');
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

  async function addEventPreset(preset: { name: string; type: string }): Promise<void> {
    try {
      await api('/giving/funds', { method: 'POST', body: preset });
      setFunds(await api<any[]>('/giving/funds/all'));
      setNotice(`"${preset.name}" added to your money categories — it now appears when recording offerings.`);
      setError('');
    } catch (err) { setError(err instanceof Error ? err.message : 'add failed'); }
  }

  async function saveFees(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      const body = { ...fees, feeBps: Number(fees.feeBps), feeFlatMinor: Number(fees.feeFlatMinor), feeCapMinor: fees.feeCapMinor === null || fees.feeCapMinor === '' ? null : Number(fees.feeCapMinor) };
      await api('/giving/settings', { method: 'POST', body });
      setNotice('Offering fee saved — it applies to future online offerings.');
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
      setNotice(`Verse-of-the-day ${dev.enabled ? 'ON' : 'off'} — a Bible verse every day at 8pm to opted-in members.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'save failed');
    }
  }

  async function saveAll(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await api('/demographics/brackets', { method: 'PUT', body: { brackets } });
      await api('/demographics/settings', { method: 'PUT', body: toggles });
      setNotice('Church groups saved — attendance sections updated.');
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
          ['church', 'Church setup', 'Logo, church identity & tagline, denominations, church groups, offering details, retention and alerts'],
          ['sms', 'SMS setup', 'SMS gateway & sender ID, verse-of-the-day, and Twi/Ga/Ewe/Fante message templates'],
          ['giving', 'Offering', 'Money categories, special events (Harvest, Thanksgiving…) and online offering fees'],
          ['appearance', 'Appearance', 'Colour themes and dark mode for this device'],
          ['modules', 'App sections', 'Turn whole areas of the app on or off for this church'],
          ['billing', 'Subscription', 'Monthly fee, Paystack or cash, and the payment history'],
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
          ? 'Logo, church identity, denomination, church groups, offering details, retention & alerts.'
          : tab === 'sms'
            ? 'Gateway, sender, verse-of-the-day and Twi/Ga/Ewe/Fante message templates.'
            : tab === 'giving'
              ? 'Money categories, special events like Harvest, and the online offering fee.'
              : tab === 'appearance'
                ? 'Pick a colour scheme or switch to dark mode. It applies to this device straight away.'
                : tab === 'modules'
                  ? 'Tick the sections this church runs — hidden everywhere until ticked, nothing is deleted, and you can switch them back on here.'
                  : 'The monthly fee that keeps this workspace open. Pay with Paystack, or tell the office about a cash payment.'}
      </p>

      <form className="card stack" onSubmit={saveAll} hidden={tab !== 'church'}>
        <h2>Church groups</h2>
        <p className="muted">
          These groups decide how attendance is counted and where members are placed automatically. The simple set is
          Sunday School (Boys), Sunday School (Girls), Men and Women — rename any group, split or merge them, or add your
          own. Detailed age groups are one click away.
        </p>
        <div className="row">
          <button className="small secondary" type="button" onClick={() => setBrackets(SIMPLE_BRACKETS)}>
            Simple: Sunday School · Men · Women
          </button>
          <button className="small secondary" type="button" onClick={() => setBrackets(DETAILED_BRACKETS)}>
            Detailed age groups
          </button>
        </div>
        {brackets.map((b, i) => (
          <div className="row" key={i}>
            <input style={{ flex: 2 }} value={b.label} onChange={(e) => upd(i, { label: e.target.value })} placeholder="Group name" />
            <input style={{ width: 110 }} value={b.key} onChange={(e) => upd(i, { key: e.target.value, segmentKey: e.target.value })} placeholder="KEY" />
            <input style={{ width: 70 }} type="number" value={b.minAge} onChange={(e) => upd(i, { minAge: Number(e.target.value) })} />
            <span>to</span>
            <input style={{ width: 70 }} type="number" value={b.maxAge ?? ''} placeholder="∞" onChange={(e) => upd(i, { maxAge: e.target.value === '' ? null : Number(e.target.value) })} />
            <label style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={b.genderSplit} onChange={(e) => upd(i, { genderSplit: e.target.checked })} />
              Split into two
            </label>
            {b.genderSplit ? (
              <>
                <input
                  style={{ width: 170 }}
                  value={b.maleLabel ?? 'Men'}
                  onChange={(e) => upd(i, { maleLabel: e.target.value })}
                  placeholder="First group name"
                  aria-label="First split group name"
                />
                <input
                  style={{ width: 170 }}
                  value={b.femaleLabel ?? 'Women'}
                  onChange={(e) => upd(i, { femaleLabel: e.target.value })}
                  placeholder="Second group name"
                  aria-label="Second split group name"
                />
              </>
            ) : null}
            <button
              className="small secondary"
              type="button"
              disabled={brackets.length <= 1}
              onClick={() => setBrackets(brackets.filter((_, idx) => idx !== i))}
            >
              Remove
            </button>
          </div>
        ))}
        <button className="secondary" type="button" onClick={() => setBrackets([...brackets, { key: `GROUP_${brackets.length + 1}`, label: 'New group', minAge: 0, maxAge: null, genderSplit: false, segmentKey: `GROUP_${brackets.length + 1}` }])}>
          + Add group
        </button>
        <h2>Counting options</h2>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={toggles.autoAssignHeadcount} onChange={(e) => setToggles({ ...toggles, autoAssignHeadcount: e.target.checked })} />
          Place people in their group automatically when they check in
        </label>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={toggles.autoPromote} onChange={(e) => setToggles({ ...toggles, autoPromote: e.target.checked })} />
          Move a member to the next group automatically after their birthday
        </label>
        <label>
          Seats in the church building (0 = no “almost full” warning)
          <input type="number" min={0} value={toggles.capacity} onChange={(e) => setToggles({ ...toggles, capacity: Number(e.target.value) })} />
        </label>
        <button>Save groups</button>
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
        <p className="muted">Every day at 8pm, a short Bible verse goes by SMS to members who agreed to receive it. Uses your chosen Bible translation.</p>
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
        <p className="muted">Name, logo and primary colour show on the top bar, login, public offering page and member portal. Offering details appear on that page and the member home.</p>
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
            <input type="color" value={prof.branding?.primaryColor ?? '#1f4d3a'} onChange={(e) => setProf({ ...prof, branding: { ...prof.branding, primaryColor: e.target.value } })} />
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
        <h2>Offering details (MoMo / bank)</h2>
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
            Keep offering records (years)
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
        <h2>Money categories &amp; special events</h2>
        <p className="muted">
          These are the choices members see when they give. Offering, Tithe, Mini Harvest, Annual Harvest and Welfare are
          ready already. Add an occasional event like a church anniversary or seed offering only when you run it — then
          pick it when you record money.
        </p>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {SPECIAL_EVENT_PRESETS.filter(
            (p) =>
              !funds.some(
                (f) => f.name?.trim().toLowerCase() === p.name.toLowerCase() || f.type === p.type,
              ),
          ).map((p) => (
            <button key={p.name} className="small secondary" type="button" onClick={() => void addEventPreset(p)}>
              + {p.name}
            </button>
          ))}
        </div>
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
          <input style={{ flex: 2 }} placeholder="New category or event (e.g. Harvest 2027)" value={newFund.name} onChange={(e) => setNewFund({ ...newFund, name: e.target.value })} />
          <select value={newFund.type} onChange={(e) => setNewFund({ ...newFund, type: e.target.value })}>
            {['OFFERING', 'TITHE', 'WELFARE', 'BUILDING', 'MISSIONS', 'SEED', 'EVENT', 'OTHER', 'FIRST_FRUIT', 'THANKSGIVING', 'HARVEST', 'ANNIVERSARY'].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button className="small" type="submit">+ Add category</button>
        </div>
      </form>

      <form className="card stack" onSubmit={saveFees} hidden={tab !== 'giving'}>
        <h2>Online offering fees</h2>
        <p className="muted">Paystack charges 1.95% + GHS 0.10 for local cards. Choose who pays that fee, and cap it if you like.</p>
        <div className="row">
          <label style={{ flex: 2 }}>
            Who pays the fee
            <select value={fees.feeMode} onChange={(e) => setFees({ ...fees, feeMode: e.target.value })}>
              <option value="CHURCH_ABSORBS">The church pays it</option>
              <option value="GIVER_ABSORBS">The member pays it (added on top)</option>
              <option value="GIVER_CHOICE">The member chooses at checkout</option>
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

      <div className="card stack" hidden={tab !== 'appearance'}>
        <h2>Colour &amp; dark mode</h2>
        <p className="muted">
          Pick the look you like best. Night is dark mode for evening services and low light. Your choice is remembered on
          this phone or computer — it does not change what anyone else sees.
        </p>
        <div className="theme-grid" role="radiogroup" aria-label="Colour theme">
          {THEMES.map((t) => (
            <button
              key={t.key}
              type="button"
              role="radio"
              aria-checked={theme === t.key}
              className={`theme-card${theme === t.key ? ' on' : ''}`}
              onClick={() => {
                setTheme(t.key);
                applyTheme(t.key);
              }}
            >
              <span className="theme-swatch" aria-hidden="true">
                {t.colors.map((c, i) => (
                  <span key={i} style={{ background: c }} />
                ))}
              </span>
              <span className="name">{t.name}</span>
              <span className="hint">{theme === t.key ? 'In use' : t.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault();
          void saveModules();
        }}
        hidden={tab !== 'modules'}
      >
        <h2>App sections</h2>
        <p className="muted">
          Tick the areas this church uses. Anything you untick disappears from the menu, the tabs and the dashboard for
          everyone here — nothing is deleted, and you can add it back any time from this page. Each line says what you will
          see when you tick it.
        </p>
        <p className="muted">
          You are using <b>{usedCount}</b> of {MODULE_KEYS.length}. The other {unusedCount} are listed below, waiting for
          the day your church runs them.
        </p>
        {[
          {
            title: 'Part of every week',
            keys: coreKeys,
            blurb: 'These are on for a new church. Untick one only if your church truly does not use it.',
          },
          {
            title: 'Add when your church runs it',
            keys: extraKeys,
            blurb: 'These start off, so a new church sees a short menu. Tick the ones you actually run.',
          },
        ].map((group) =>
          group.keys.length === 0 ? null : (
            <div key={group.title} className="stack">
              <h3 style={{ margin: 0 }}>{group.title}</h3>
              <p className="muted" style={{ fontSize: '0.85rem', margin: 0 }}>
                {group.blurb}
              </p>
              {group.keys.map((key) => (
                <label key={key} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={modules[key] !== false}
                    onChange={(e) => setModules({ ...modules, [key]: e.target.checked })}
                  />
                  <span>
                    <strong>{MODULE_LABELS[key].label}</strong>
                    <span className="muted" style={{ display: 'block', fontSize: '0.85rem' }}>
                      {MODULE_LABELS[key].hint}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          ),
        )}
        <button>Save app sections</button>
        <p className="muted" style={{ fontSize: '0.85rem', margin: 0 }}>
          Saving reloads the app so the menu updates. Care stays visible only to ushers and Sunday School teachers, even
          after you tick it.
        </p>
      </form>
      <div hidden={tab !== 'billing'} style={{ marginTop: '0.4rem' }}>
        <BillingPanel />
      </div>
    </div>
  );
}
