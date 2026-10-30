// R4.3 per-church SMS template locales (Twi/Ga/Ewe/Fante) with English fallback.
// Churches override built-in texts per locale in Settings; send paths call
// localizedSmsBody(key, settings, vars) — resolution order:
//   templates[defaultLocale][key] (when defaultLocale !== 'en')
//     → templates.en[key] → BUILTIN_SMS_TEMPLATES[key]
// then the standard {var} render (loud on missing vars, like all SMS).
import { render, TemplateVars } from './template';

export type SmsLocale = 'en' | 'tw' | 'ga' | 'ewe' | 'fante';
export const SMS_LOCALES: SmsLocale[] = ['en', 'tw', 'ga', 'ewe', 'fante'];
export const SMS_LOCALE_LABELS: Record<SmsLocale, string> = {
  en: 'English',
  tw: 'Twi',
  ga: 'Ga',
  ewe: 'Ewe',
  fante: 'Fante',
};

export type SmsTemplateKey = 'receipt' | 'nudge' | 'otp' | 'portalOtp' | 'passwordReset' | 'devotional' | 'funeral';
export const SMS_TEMPLATE_KEYS: SmsTemplateKey[] = ['receipt', 'nudge', 'otp', 'portalOtp', 'passwordReset', 'devotional', 'funeral'];

/** Placeholders each template may use (shown in the admin editor). */
export const SMS_TEMPLATE_VARS: Record<SmsTemplateKey, string> = {
  receipt: '{amount} {churchName} {fundName} {reference}',
  nudge: '{name} {amount} {churchName} {retryLink}',
  otp: '{code} {ttlMinutes}',
  portalOtp: '{code} {ttlMinutes}',
  passwordReset: '{code} {ttlMinutes}',
  devotional: '{text} {ref} {translation} {churchName}',
  funeral: '{churchName} {title} {body}',
};

export const BUILTIN_SMS_TEMPLATES: Record<SmsTemplateKey, string> = {
  receipt: 'Thank you for your gift of {amount} to {churchName} ({fundName}). Reference: {reference}. God bless you!',
  nudge: 'Hi {name}, your gift of {amount} to {churchName} did not complete. Tap {retryLink} to try again.',
  otp: 'Your login code is {code}. Valid {ttlMinutes} minutes. Never share it.',
  portalOtp: 'Your portal login code is {code}. Valid {ttlMinutes} minutes.',
  passwordReset: 'Password reset code: {code}. Valid {ttlMinutes} minutes. If you did not ask for this, ignore this message.',
  devotional: '"{text}" — {ref} ({translation}) — {churchName}',
  // R4.6 funeral/one-week announcement copy (admins paste into campaigns).
  funeral: '{churchName}: {title}. {body}',
};

export interface SmsLocaleSettings {
  defaultLocale?: SmsLocale; // active sending locale (en = built-ins/overrides only)
  templates?: Partial<Record<SmsLocale, Partial<Record<SmsTemplateKey, string>>>>;
}

export function localizedSmsBody(
  key: SmsTemplateKey,
  settings: SmsLocaleSettings | null | undefined,
  vars: TemplateVars,
): string {
  const loc: SmsLocale | undefined =
    settings?.defaultLocale && settings.defaultLocale !== 'en' ? settings.defaultLocale : undefined;
  const tpl =
    (loc ? settings?.templates?.[loc]?.[key] : undefined) ??
    settings?.templates?.en?.[key] ??
    BUILTIN_SMS_TEMPLATES[key];
  return render(tpl, vars);
}
