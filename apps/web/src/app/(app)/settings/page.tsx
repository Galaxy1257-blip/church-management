'use client';
// Church settings: age brackets (demographics) + toggles + SMS gateway card,
// R4 customisation: profile/branding, funds, fees, care alerts, SMS locales.
import { FormEvent, useEffect, useState } from 'react';
import {
  Building2,
  CreditCard,
  MessageSquare,
  Paintbrush,
  Puzzle,
  Settings as SettingsIcon,
} from 'lucide-react';
import { api } from '../../../lib/api';
import { translationLabel } from '../../../lib/bible';
import BillingPanel from '../../../components/billing-panel';
import { clearSession } from '../../../lib/session';
import { MODULE_GROUPS, MODULE_KEYS, MODULE_LABELS } from '../../../lib/access';
import Notice from '../../../components/notice';
import { subscribeThisDevice } from '../../../lib/push';
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
  { key: 'sanctuary', name: 'Sanctuary', hint: 'Forest & gold', colors: ['#1f4d3a', '#c08a2e', '#b4513a', '#f5efe4'] },
  { key: 'harvest', name: 'Harvest', hint: 'Olive & violet', colors: ['#4e5a1b', '#7a4bd0', '#c2811e', '#f6f3e9'] },
  { key: 'ocean', name: 'Ocean', hint: 'Deep teal & coral', colors: ['#0f4c5c', '#e07a5f', '#2e8b9e', '#eaf3f5'] },
  { key: 'navy', name: 'Navy', hint: 'Navy & amber', colors: ['#1b2a4a', '#e0a100', '#3f6fb0', '#eef2f8'] },
  { key: 'burgundy', name: 'Burgundy', hint: 'Wine & emerald', colors: ['#6d1f3a', '#2fa37a', '#b05170', '#f7eef1'] },
  { key: 'plum', name: 'Plum', hint: 'Aubergine & lime', colors: ['#4e2a6e', '#a6c43a', '#8a5bb5', '#f4eff8'] },
  { key: 'dawn', name: 'Dawn', hint: 'Rust & sky', colors: ['#9c3d2e', '#2c7da0', '#d98e63', '#fbf0ea'] },
  { key: 'rosewood', name: 'Rosewood', hint: 'Rose & teal', colors: ['#8a2f4a', '#1f8a70', '#c4667f', '#f9eef1'] },
  { key: 'meadow', name: 'Meadow', hint: 'Green & magenta', colors: ['#2e6b3e', '#c24e8a', '#6fa34f', '#eef6ee'] },
  { key: 'sage', name: 'Sage', hint: 'Sage & terracotta', colors: ['#3f6256', '#c26b3a', '#7fa394', '#f0f4f0'] },
  { key: 'sand', name: 'Sand', hint: 'Ochre & indigo', colors: ['#7a5a1e', '#3457a6', '#b8863a', '#f7f1e3'] },
  // Cool, vivid and neutral families — each brand paired with its complement.
  { key: 'sky', name: 'Sky', hint: 'Blue & orange', colors: ['#1e4f8a', '#e07a2e', '#3e8ed0', '#eef4fb'] },
  { key: 'mint', name: 'Mint', hint: 'Teal & rose', colors: ['#0f6b5c', '#c2506b', '#2fa38c', '#ecf8f4'] },
  { key: 'indigo', name: 'Indigo', hint: 'Indigo & amber', colors: ['#3730a3', '#e0a100', '#6a5ae0', '#eef0fb'] },
  { key: 'violet', name: 'Violet', hint: 'Violet & gold', colors: ['#6b21a8', '#c9b027', '#9b5bd6', '#f5f0fb'] },
  { key: 'coral', name: 'Coral', hint: 'Red & teal', colors: ['#b03a2e', '#1f8a8a', '#e0663f', '#fdf0ec'] },
  { key: 'blossom', name: 'Blossom', hint: 'Magenta & green', colors: ['#9d174d', '#2e8b57', '#e0559b', '#fcf0f5'] },
  { key: 'slate', name: 'Slate', hint: 'Slate & amber', colors: ['#2c3a4b', '#c98a2e', '#5b7a99', '#f3f5f8'] },
  { key: 'night', name: 'Night', hint: 'Charcoal & teal-gold (dark)', colors: ['#0e141b', '#256b5a', '#e6b450', '#e9eff6'] },
];

const THEME_KEY = 'chms.theme';
const FONT_SIZE_KEY = 'chms.fontSize';
const FONT_SIZES: { key: 'normal' | 'large' | 'xlarge'; name: string; hint: string }[] = [
  { key: 'normal', name: 'Standard', hint: 'Default (16px)' },
  { key: 'large', name: 'Large', hint: 'Easier reading (17.5px)' },
  { key: 'xlarge', name: 'Extra large', hint: 'Maximum legibility (19px)' },
];

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

function applyFontSize(key: 'normal' | 'large' | 'xlarge'): void {
  if (typeof document === 'undefined') return;
  if (key === 'normal') delete document.documentElement.dataset.fontSize;
  else document.documentElement.dataset.fontSize = key;
  try {
    localStorage.setItem(FONT_SIZE_KEY, key);
  } catch {
    /* private mode — the font size still applies for this visit */
  }
}

export default function SettingsPage() {
  const [brackets, setBrackets] = useState<Bracket[]>(SIMPLE_BRACKETS);
  const [toggles, setToggles] = useState({ autoAssignHeadcount: true, autoPromote: false, capacity: 0 });
  const [gw, setGw] = useState<any>(null);
  const [dev, setDev] = useState({ enabled: false, inApp: true, translation: 'kjv', verse: '' });
  const [translations, setTranslations] = useState<{ code: string; language: string; translation: string }[]>([]);
  const [todayReading, setTodayReading] = useState<{ ref: string; text: string; note: string } | null>(null);
  const [todayReadingError, setTodayReadingError] = useState('');
  // Church customisation: name/logo/branding, contact, giving instructions, funds, fees.
  const [prof, setProf] = useState<any>({ name: '', pastorDisplayName: '', smsSenderId: '', branding: {}, contact: {}, givingInstructions: {} });
  const [funds, setFunds] = useState<any[]>([]);
  const [newFund, setNewFund] = useState({ name: '', type: 'OFFERING' });
  const [fees, setFees] = useState<any>({ feeMode: 'CHURCH_ABSORBS', feeBps: 195, feeFlatMinor: 10, feeCapMinor: null, feeDefaultOptIn: true });
  // SMS template locales (Twi/Ga/Ewe/Fante) with English fallback.
  const [smsLoc, setSmsLoc] = useState<{ defaultLocale: string; templates: Record<string, Record<string, string>> }>({ defaultLocale: 'en', templates: {} });
  // Quiet hours: marketing-style SMS waits for this window (default 20:00–08:00, on).
  const [quiet, setQuiet] = useState<{ enabled: boolean; start: number; end: number }>({ enabled: true, start: 20, end: 8 });
  // Guardian texts on child check-in/out: its own switch, on unless turned off.
  const [pickupSms, setPickupSms] = useState(true);
  // Phone notifications (web push): on unless turned off; delivery needs server keys.
  const [pushEnabled, setPushEnabled] = useState(true);
  const [pushConfigured, setPushConfigured] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushResult, setPushResult] = useState('');
  const [locKey, setLocKey] = useState('tw');
  // denomination terminology pack.
  const [denomKey, setDenomKey] = useState('DEFAULT');
  const [terms, setTerms] = useState<{ unit: string; unitPlural: string; unitLeader: string; gathering: string; leadershipBody: string } | null>(null);
  const [gwForm, setGwForm] = useState({ mode: 'mock', label: '', url: '', authHeader: 'Authorization', authValue: '', bodyTemplate: '{"to":"{to}","message":"{message}"}', idPath: 'id', confirmed: false });
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  // grouped settings: church setup (identity/logo/policy) vs SMS vs giving vs modules
  const [tab, setTab] = useState<'church' | 'sms' | 'giving' | 'appearance' | 'modules' | 'billing'>('church');
  const [theme, setTheme] = useState('sanctuary');
  const [fontSize, setFontSize] = useState<'normal' | 'large' | 'xlarge'>('normal');
  // Which areas of the app this church runs. Both the current set and the
  // starting set come from the API (/churches/me/profile) — the one table lives
  // in packages/shared/src/modules.ts, and this page keeps no copy of it.
  const [modules, setModules] = useState<Record<string, boolean>>({});
  // Staff requests "please turn this section on" (shown only to leaders here).
  const [moduleRequests, setModuleRequests] = useState<{ module: string; byName?: string }[]>([]);
  /**
   * The answer the office gives when they switch Offerings off: keep the public
   * give link open, or close it with the books. Asked once, honoured by the API.
   */
  const [stopGiving, setStopGiving] = useState(false);
  // Members may send in notices + prayer requests with photos (companion app).
  const [memberPosts, setMemberPosts] = useState(false);
  // Members can add themselves with this one church code.
  const [joinCode, setJoinCode] = useState<{ enabled: boolean; code: string }>({ enabled: false, code: '' });
  const [startModules, setStartModules] = useState<Record<string, boolean>>({});
  const usedCount = MODULE_KEYS.filter((key) => modules[key]).length;
  const unusedCount = MODULE_KEYS.length - usedCount;
  // Group master switches and the modules that stand outside any group (bible).
  const groupMasterKeys = MODULE_GROUPS.map((g) => g.key);
  const groupChildKeys = MODULE_GROUPS.flatMap((g) => g.children);
  const standaloneKeys = MODULE_KEYS.filter((k) => !groupMasterKeys.includes(k) && !groupChildKeys.includes(k));
  const isCoreKey = (key: string) => !!startModules[key];

  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved && THEMES.some((t) => t.key === saved)) setTheme(saved);
      const savedFont = localStorage.getItem(FONT_SIZE_KEY);
      if (savedFont === 'normal' || savedFont === 'large' || savedFont === 'xlarge') setFontSize(savedFont);
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
    void api<{ enabled: boolean; inApp: boolean; translation: string; verse: string }>('/churches/me/devotional').then(setDev).catch(() => undefined);
    void api<{ translations: { code: string; language: string; translation: string }[] }>('/bible').then((r) => setTranslations(r.translations)).catch(() => undefined);
    void api<{ enabled: boolean; code: string }>('/churches/me/join-code').then(setJoinCode).catch(() => undefined);
    void api<any>('/churches/me/profile').then((p) => {
      setProf(p);
      if (p.branding?.primaryColor) document.documentElement.style.setProperty('--brand', p.branding.primaryColor);
      if (p.smsLocales) setSmsLoc({ defaultLocale: p.smsLocales.defaultLocale ?? 'en', templates: p.smsLocales.templates ?? {} });
      if (p.denomination) { setDenomKey(p.denomination.key ?? 'DEFAULT'); setTerms(p.denomination.terms ?? null); }
      if (p.modules) setModules({ ...p.moduleDefaults, ...p.modules });
      if (Array.isArray(p.moduleRequests)) setModuleRequests(p.moduleRequests);
      if (p.moduleDefaults) setStartModules(p.moduleDefaults);
      if (typeof p.memberPosts === 'boolean') setMemberPosts(p.memberPosts);
      if (p.smsQuietHours) setQuiet({ enabled: p.smsQuietHours.enabled !== false, start: p.smsQuietHours.start ?? 20, end: p.smsQuietHours.end ?? 8 });
      if (typeof p.childPickupSms === 'boolean') setPickupSms(p.childPickupSms);
      if (typeof p.pushEnabled === 'boolean') setPushEnabled(p.pushEnabled);
      if (typeof p.pushConfigured === 'boolean') setPushConfigured(p.pushConfigured);
      if (typeof p.moneyOffStopsGiving === 'boolean') setStopGiving(p.moneyOffStopsGiving);
    }).catch(() => undefined);
    void api<any[]>('/giving/funds/all').then(setFunds).catch(() => undefined);
    void api<any>('/giving/settings').then((s) => s && setFees(s)).catch(() => undefined);
  }, []);

  // Preview exactly what today's card and tonight's SMS will carry, so the
  // owner sees the rotation working before the clock strikes 8pm. A pinned
  // reference the Bible cannot resolve used to vanish silently; it now says so.
  useEffect(() => {
    const q = new URLSearchParams({ translation: dev.translation });
    if (dev.verse.trim()) q.set('verse', dev.verse.trim());
    void api<{ ref: string; text: string; note: string }>(`/bible/daily?${q.toString()}`)
      .then((r) => {
        setTodayReading(r);
        setTodayReadingError('');
      })
      .catch(() => {
        setTodayReading(null);
        setTodayReadingError(
          dev.verse.trim()
            ? `That pinned verse is not in the selected Bible — check the spelling, for example John 3:16.`
            : 'This Bible could not be read — try another translation.',
        );
      });
  }, [dev.translation, dev.verse]);

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
      // While Offerings is on the question is not asked, so the stored answer is
      // cleared — otherwise switching the section back off would silently restore
      // a decision nobody is looking at.
      const p = await api<any>('/churches/me/profile', {
        method: 'POST',
        body: { modules, memberPosts, moneyOffStopsGiving: modules.money ? false : stopGiving },
      });
      if (p.modules) setModules({ ...p.moduleDefaults, ...p.modules });
      setError('');
      clearSession();
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'module save failed');
    }
  }

  /** A leader answers a staff request by turning that section on (then reloads). */
  async function enableRequest(module: string): Promise<void> {
    try {
      const next = { ...modules, [module]: true };
      await api('/churches/me/profile', {
        method: 'POST',
        body: { modules: next, memberPosts, moneyOffStopsGiving: modules.money ? false : stopGiving },
      });
      clearSession();
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not turn it on');
    }
  }

  async function dismissRequest(module: string): Promise<void> {
    try {
      await api('/churches/me/section-request/dismiss', { method: 'POST', body: { module } });
      setModuleRequests((list) => list.filter((r) => r.module !== module));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not dismiss');
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

  async function saveQuietHours(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      const start = Number(quiet.start);
      const end = Number(quiet.end);
      if (!Number.isInteger(start) || start < 0 || start > 23 || !Number.isInteger(end) || end < 0 || end > 23) {
        setError('Quiet hours must be whole hours from 0 (midnight) to 23 (11pm).');
        return;
      }
      await api('/churches/me/profile', { method: 'POST', body: { smsQuietHours: { enabled: quiet.enabled, start, end } } });
      setNotice(
        quiet.enabled
          ? `Quiet hours ${String(start).padStart(2, '0')}:00–${String(end).padStart(2, '0')}:00 — campaigns, notices and events wait for morning. Receipts and codes are never held.`
          : 'Quiet hours off — marketing-style SMS sends as soon as you press send.',
      );
      setError('');
    } catch (err) { setError(err instanceof Error ? err.message : 'quiet hours save failed'); }
  }

  async function savePickupSms(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await api('/churches/me/profile', { method: 'POST', body: { childPickupSms: pickupSms } });
      setError('');
      setNotice(
        pickupSms
          ? 'Guardian texts on — one text is queued at check-in and one at collection, using one SMS credit each.'
          : 'Guardian texts off — the desk will not text anyone when a child is checked in or collected.',
      );
    } catch (err) { setError(err instanceof Error ? err.message : 'could not save the guardian-text setting'); }
  }

  async function savePush(e: FormEvent): Promise<void> {
    e.preventDefault();
    try {
      await api('/churches/me/profile', { method: 'POST', body: { pushEnabled } });
      setError('');
      setNotice(
        pushEnabled
          ? 'Phone notifications on — a leader can now ring members\u2019 phones when they choose “Push” on a notice.'
          : 'Phone notifications off — notices stay in the app and are not sent to phones.',
      );
    } catch (err) { setError(err instanceof Error ? err.message : 'could not save the phone-notification setting'); }
  }

  /** Subscribe this office device, then ask the server to send one test push. */
  async function sendTestPush(): Promise<void> {
    setPushBusy(true);
    setPushResult('');
    try {
      const sub = await subscribeThisDevice();
      await api('/push/subscribe', { method: 'POST', body: sub });
      const r = await api<{ configured: boolean; enabled: boolean; sent: number; pruned: number }>('/push/test', { method: 'POST' });
      if (!r.configured) setPushResult('The server has no notification keys yet, so nothing was delivered.');
      else if (!r.enabled) setPushResult('Phone notifications are switched off above, so nothing was sent.');
      else if (r.sent === 0) setPushResult('No phones are subscribed yet — this device was just added, try once more.');
      else setPushResult(`Sent to ${r.sent} phone${r.sent === 1 ? '' : 's'}.${r.pruned ? ` Removed ${r.pruned} dead.` : ''}`);
    } catch (err) {
      setPushResult(err instanceof Error ? err.message : 'Could not send a test.');
    } finally {
      setPushBusy(false);
    }
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
      setNotice(
        `Daily reading saved — ${dev.inApp ? 'showing in the app' : 'hidden in the app'}; ` +
          `SMS at 8pm ${dev.enabled ? 'on' : 'off'}.` +
          (dev.verse.trim() ? ` Repeating ${dev.verse.trim()} each day.` : ' Each day brings a different passage.'),
      );
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

  const TAB_META: { key: typeof tab; label: string; hint: string; icon: typeof SettingsIcon }[] = [
    { key: 'church', label: 'Church setup', hint: 'Logo, church identity & tagline, denominations, church groups, offering details, retention and alerts', icon: Building2 },
    { key: 'sms', label: 'SMS setup', hint: 'SMS gateway & sender ID, verse-of-the-day, and Twi/Ga/Ewe/Fante message templates', icon: MessageSquare },
    { key: 'giving', label: 'Offering', hint: 'Money categories, special events (Harvest, Thanksgiving…) and online offering fees', icon: CreditCard },
    { key: 'appearance', label: 'Appearance', hint: 'Colour themes and dark mode for this device', icon: Paintbrush },
    { key: 'modules', label: 'App sections', hint: 'Turn whole areas of the app on or off for this church', icon: Puzzle },
    { key: 'billing', label: 'Subscription', hint: 'Monthly fee, Paystack or cash, and the payment history', icon: CreditCard },
  ];

  return (
    <div className="page-fade">
      <h1>Settings</h1>
      {notice ? <Notice text={notice} onDone={() => setNotice('')} /> : null}
      {error ? <Notice kind="error" text={error} onDone={() => setError('')} /> : null}

      <div className="settings-layout">
        <div className="settings-tabs" role="tablist" aria-label="Settings sections">
          {TAB_META.map(({ key, label, hint, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              title={hint}
              className={tab === key ? 'on' : ''}
              onClick={() => setTab(key)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
        <div className="settings-body">
      <p className="muted" style={{ marginTop: '-0.1rem' }}>
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
            <input aria-label="Age group name" style={{ flex: 2 }} value={b.label} onChange={(e) => upd(i, { label: e.target.value })} placeholder="Group name" />
            <input aria-label="Age group key" style={{ width: 110 }} value={b.key} onChange={(e) => upd(i, { key: e.target.value, segmentKey: e.target.value })} placeholder="KEY" />
            <input aria-label="Age group minimum age" style={{ width: 70 }} type="number" value={b.minAge} onChange={(e) => upd(i, { minAge: Number(e.target.value) })} />
            <span>to</span>
            <input aria-label="Age group maximum age (blank for no limit)" style={{ width: 70 }} type="number" value={b.maxAge ?? ''} placeholder="∞" onChange={(e) => upd(i, { maxAge: e.target.value === '' ? null : Number(e.target.value) })} />
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
        <h2>Daily Bible reading</h2>
        <p className="muted">
          A different passage every day, read from the Bible bundled in the app — no internet needed.
          The in-app card and the 8pm SMS are separate switches, so you can have the reading without
          paying for texts, or texts without the card. Both follow the Bible area switch in App sections.
        </p>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={dev.inApp} onChange={(e) => setDev({ ...dev, inApp: e.target.checked })} />
          Show it in the app — dashboard and member home (free)
        </label>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={dev.enabled} onChange={(e) => setDev({ ...dev, enabled: e.target.checked })} />
          Send it by SMS at 8pm (uses your SMS credit)
        </label>
        <div className="row">
          <label>
            Bible translation
            <select value={dev.translation} onChange={(e) => setDev({ ...dev, translation: e.target.value })}>
              {(translations.length ? translations : [{ code: 'kjv', language: 'English', translation: 'KJV' }]).map((t) => (
                <option key={t.code} value={t.code}>{translationLabel(t)}</option>
              ))}
            </select>
          </label>
          <label style={{ flex: 1 }}>
            Repeat one verse instead
            <input
              value={dev.verse}
              onChange={(e) => setDev({ ...dev, verse: e.target.value })}
              placeholder="Blank = a new verse every day"
            />
          </label>
        </div>
        {todayReading ? (
          <p className="muted" style={{ marginBottom: 0 }}>
            Today — <strong>{todayReading.ref}</strong>: &ldquo;{todayReading.text}&rdquo;
            {todayReading.note ? <><br />{todayReading.note}</> : null}
          </p>
        ) : todayReadingError ? (
          <p className="error" style={{ marginBottom: 0 }}>{todayReadingError}</p>
        ) : null}
        <button>Save daily reading</button>
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
            <input aria-label="Fund name" style={{ flex: 2 }} value={f.name} onChange={(e) => setFunds(funds.map((x) => (x.id === f.id ? { ...x, name: e.target.value } : x)))} />
            <select aria-label="Fund type" style={{ width: 150 }} value={f.type} onChange={(e) => setFunds(funds.map((x) => (x.id === f.id ? { ...x, type: e.target.value } : x)))}>
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
          <input aria-label="New fund category or event name" style={{ flex: 2 }} placeholder="New category or event (e.g. Harvest 2027)" value={newFund.name} onChange={(e) => setNewFund({ ...newFund, name: e.target.value })} />
          <select aria-label="New fund type" value={newFund.type} onChange={(e) => setNewFund({ ...newFund, type: e.target.value })}>
            {['OFFERING', 'TITHE', 'WELFARE', 'BUILDING', 'MISSIONS', 'SEED', 'EVENT', 'OTHER', 'FIRST_FRUIT', 'THANKSGIVING', 'HARVEST', 'ANNIVERSARY'].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button className="small" type="submit">+ Add category</button>
        </div>
      </form>

      <form className="card stack" onSubmit={saveFees} hidden={tab !== 'giving'}>
        <h2>Online offering fees</h2>
        <p className="muted">Paystack charges 1.95% + GH₵ 0.10 for local cards. Choose who pays that fee, and cap it if you like.</p>
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

      <form className="card stack" onSubmit={saveQuietHours} hidden={tab !== 'sms'}>
        <h2>Quiet hours</h2>
        <p className="muted">
          Campaigns, notices, events and roster texts wait for this window to end, so nobody gets woken up.
          Receipts, verification codes and replies are never held.
        </p>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={quiet.enabled} onChange={(e) => setQuiet({ ...quiet, enabled: e.target.checked })} />
          Hold marketing-style SMS overnight
        </label>
        <div className="row">
          <label>
            Quiet hours start (hour)
            <input
              type="number"
              min={0}
              max={23}
              value={quiet.start}
              aria-label="Quiet hours start hour"
              onChange={(e) => setQuiet({ ...quiet, start: Number(e.target.value) })}
            />
          </label>
          <label>
            Quiet hours end (hour)
            <input
              type="number"
              min={0}
              max={23}
              value={quiet.end}
              aria-label="Quiet hours end hour"
              onChange={(e) => setQuiet({ ...quiet, end: Number(e.target.value) })}
            />
          </label>
          <span className="muted" style={{ alignSelf: 'center' }}>
            {quiet.start === quiet.end
              ? 'Same hour = no quiet hours'
              : `${String(quiet.start).padStart(2, '0')}:00 – ${String(quiet.end).padStart(2, '0')}:00`}
          </span>
        </div>
        <button>Save quiet hours</button>
      </form>

      <form className="card stack" onSubmit={savePickupSms} hidden={tab !== 'sms'}>
        <h2>Guardian texts</h2>
        <p className="muted">
          When a child is checked in or collected, the adult who dropped them off gets one short text. It says the
          child&rsquo;s first name, the church and the time — never the pickup code. Each text uses one SMS credit and
          is not held by quiet hours. If the SMS gateway is still in test mode, messages are recorded but not
          delivered to a phone.
        </p>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={pickupSms} onChange={(e) => setPickupSms(e.target.checked)} />
          Text the guardian on check-in and collection
        </label>
        <button>Save guardian texts</button>
      </form>

      <form className="card stack" onSubmit={savePush} hidden={tab !== 'sms'}>
        <h2>Phone notifications</h2>
        <p className="muted">
          When a leader posts a notice and ticks <b>Push</b>, members who turned notifications on get it on their
          phone, even with the app closed. Free to send. {pushConfigured
            ? 'This server has notification keys, so delivery works.'
            : 'This server has no notification keys yet, so nothing can be delivered until the keys are added.'}
        </p>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={pushEnabled} onChange={(e) => setPushEnabled(e.target.checked)} />
          Let leaders ring phones with a notice
        </label>
        <button disabled={pushBusy}>Save phone notifications</button>
        <button type="button" className="secondary" disabled={pushBusy || !pushConfigured} onClick={() => void sendTestPush()}>
          {pushBusy ? 'Working…' : 'Send a test to this device'}
        </button>
        {pushResult ? <p className="muted" style={{ margin: 0 }}>{pushResult}</p> : null}
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
        <h2>Denomination wording</h2>
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
        <h2>Text size</h2>
        <p className="muted">
          Make text larger across all screens on this device. Saved locally on this phone or computer.
        </p>
        <div className="row" role="radiogroup" aria-label="Text size">
          {FONT_SIZES.map((f) => (
            <button
              key={f.key}
              type="button"
              role="radio"
              aria-checked={fontSize === f.key}
              className={`secondary${fontSize === f.key ? ' chip-on' : ''}`}
              onClick={() => {
                setFontSize(f.key);
                applyFontSize(f.key);
              }}
            >
              {f.name} · <span className="muted">{f.hint}</span>
            </button>
          ))}
        </div>

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
        {moduleRequests.length ? (
          <div className="stack" style={{ marginTop: 8 }}>
            {moduleRequests.map((r) => (
              <div key={r.module} className="card" role="status">
                <p style={{ margin: '0 0 0.5rem' }}>
                  <b>{r.byName ?? 'Someone'}</b> asked to turn on{' '}
                  <b>{MODULE_LABELS[r.module as keyof typeof MODULE_LABELS]?.label ?? r.module}</b>.
                </p>
                <div className="row">
                  <button type="button" className="small" onClick={() => void enableRequest(r.module)}>
                    Turn on
                  </button>
                  <button type="button" className="small secondary" onClick={() => void dismissRequest(r.module)}>
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {Object.keys(startModules).length === 0 ? (
          <p className="muted">Loading which sections a new church starts with…</p>
        ) : (
          <>
            <p className="muted">
              You are using <b>{usedCount}</b> of {MODULE_KEYS.length}. The other {unusedCount} are listed below, waiting
              for the day your church runs them.
            </p>
            {MODULE_GROUPS.map((group) => {
              const masterOff = !modules[group.key];
              return (
                <div key={group.key} className="stack" style={{ marginTop: 6 }}>
                  <label style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={!!modules[group.key]}
                      onChange={(e) => setModules({ ...modules, [group.key]: e.target.checked })}
                    />
                    <span>
                      <strong>{MODULE_LABELS[group.key].label}</strong>{' '}
                      {isCoreKey(group.key) ? (
                        <span className="badge ok">On for a new church</span>
                      ) : (
                        <span className="badge mute">Add when you run it</span>
                      )}
                      <span className="muted" style={{ display: 'block', fontSize: '0.85rem' }}>
                        {group.hint}
                      </span>
                    </span>
                  </label>
                  <div className="stack" style={{ marginLeft: 28, marginTop: 2 }}>
                    {group.children.map((child) => (
                      <label key={child} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={!!modules[child]}
                          disabled={masterOff}
                          onChange={(e) => setModules({ ...modules, [child]: e.target.checked })}
                        />
                        <span>
                          <strong>{MODULE_LABELS[child].label}</strong>{' '}
                          {isCoreKey(child) ? (
                            <span className="badge ok">On for a new church</span>
                          ) : (
                            <span className="badge mute">Add when you run it</span>
                          )}
                          <span className="muted" style={{ display: 'block', fontSize: '0.85rem' }}>
                            {MODULE_LABELS[child].hint}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
            {standaloneKeys.length ? (
              <div className="stack" style={{ marginTop: 6 }}>
                {standaloneKeys.map((key) => (
                  <label key={key} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={!!modules[key]}
                      onChange={(e) => setModules({ ...modules, [key]: e.target.checked })}
                    />
                    <span>
                      <strong>{MODULE_LABELS[key].label}</strong>{' '}
                      {isCoreKey(key) ? (
                        <span className="badge ok">On for a new church</span>
                      ) : (
                        <span className="badge mute">Add when you run it</span>
                      )}
                      <span className="muted" style={{ display: 'block', fontSize: '0.85rem' }}>
                        {MODULE_LABELS[key].hint}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            ) : null}
            {/* Asked only while Offerings is off, and the API acts on the answer. */}
            {modules.money ? null : (
              <div className="card">
                <h3 style={{ margin: 0 }}>The link members use to give online</h3>
                <p className="muted" style={{ marginBottom: 0 }}>
                  You have switched Offerings off. Choose what happens to the giving page members and visitors open from
                  your flyer and your WhatsApp link.
                </p>
                <label style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                  <input type="radio" name="give-door" checked={!stopGiving} onChange={() => setStopGiving(false)} />
                  <span>
                    <strong>Keep it open — only close the books</strong>
                    <span className="muted" style={{ display: 'block', fontSize: '0.85rem' }}>
                      People can still give online and money still arrives in the fund. Your own money reports and the
                      giving list stay hidden until you switch Offerings back on.
                    </span>
                  </span>
                </label>
                <label style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                  <input type="radio" name="give-door" checked={stopGiving} onChange={() => setStopGiving(true)} />
                  <span>
                    <strong>Stop online giving too</strong>
                    <span className="muted" style={{ display: 'block', fontSize: '0.85rem' }}>
                      The giving page tells people this church is not taking online giving right now, and no payment can
                      be started. Turn Offerings back on to open it again.
                    </span>
                  </span>
                </label>
              </div>
            )}
          </>
        )}
        <div className="stack" style={{ marginTop: 8 }}>
          <h3 style={{ margin: 0 }}>Members adding themselves</h3>
          <label style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <input
              type="checkbox"
              checked={joinCode.enabled}
              onChange={(e) => {
                const enabled = e.target.checked;
                void api<{ enabled: boolean; code: string }>('/churches/me/join-code', { method: 'POST', body: { enabled } })
                  .then(setJoinCode)
                  .catch(() => setJoinCode(joinCode));
              }}
            />
            <span>
              <strong>Let people add themselves with a code</strong>
              <span className="muted" style={{ display: 'block', fontSize: '0.85rem' }}>
                Share this code and link with your members. Anyone without the code cannot add themselves.
              </span>
            </span>
          </label>
          {joinCode.code ? (
            <div className="row" style={{ alignItems: 'center', gap: 8 }}>
              <span className="badge ok" style={{ fontFamily: 'monospace', fontSize: '1rem' }}>{joinCode.code}</span>
              <span className="muted" style={{ fontSize: '0.85rem', wordBreak: 'break-all' }}>
                {typeof window !== 'undefined' ? `${window.location.origin}/join/${prof.slug ?? ''}` : ''}
              </span>
              <button
                type="button"
                className="small secondary"
                onClick={() => void api<{ enabled: boolean; code: string }>('/churches/me/join-code', { method: 'POST', body: { rotate: true } }).then(setJoinCode)}
              >
                New code
              </button>
            </div>
          ) : null}
        </div>
        <div className="stack" style={{ marginTop: 8 }}>
          <h3 style={{ margin: 0 }}>From your members</h3>
          <label style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <input type="checkbox" checked={memberPosts} onChange={(e) => setMemberPosts(e.target.checked)} />
            <span>
              <strong>Let members send in notices and prayer requests</strong>
              <span className="muted" style={{ display: 'block', fontSize: '0.85rem' }}>
                In their companion app they can write a notice (with a photo) or a prayer request (with a photo). A notice
                goes to the leaders first and only appears to everybody after it is approved. Works only while News is on.
              </span>
            </span>
          </label>
        </div>
        <button>Save app sections</button>
        <p className="muted" style={{ fontSize: '0.85rem', margin: 0 }}>
          Saving reloads the app so the menu updates. Care stays visible only to ushers and Sunday School teachers, even
          after you tick it.
        </p>
      </form>
      <div hidden={tab !== 'billing'} style={{ marginTop: '0.4rem' }}>
        <BillingPanel />
      </div>
        </div>{/* end settings-body */}
      </div>{/* end settings-layout */}
    </div>
  );
}
