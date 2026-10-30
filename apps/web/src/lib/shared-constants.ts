// Client-safe constants copied from shared to eliminate workspace build dependency on Vercel
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
  funeral: '{churchName}: {title}. {body}',
};

export type DenominationKey = 'DEFAULT' | 'PENTECOSTAL' | 'METHODIST_PRESBYTERIAN' | 'CATHOLIC' | 'APOSTOLIC';

export interface DenominationTerms {
  unit: string;
  unitPlural: string;
  unitLeader: string;
  gathering: string;
  leadershipBody: string;
}

export interface DenominationPreset {
  key: DenominationKey;
  label: string;
  terms: DenominationTerms;
}

export const DENOMINATION_PRESETS: DenominationPreset[] = [
  {
    key: 'DEFAULT',
    label: 'Non-denominational / Pentecostal (default)',
    terms: { unit: 'Branch', unitPlural: 'Branches', unitLeader: 'Elder', gathering: 'Sunday Service', leadershipBody: 'Council of Elders' },
  },
  {
    key: 'PENTECOSTAL',
    label: 'Pentecostal (Assemblies, Christ Embassy style)',
    terms: { unit: 'Assembly', unitPlural: 'Assemblies', unitLeader: 'Pastor', gathering: 'Service', leadershipBody: 'Executive Council' },
  },
  {
    key: 'METHODIST_PRESBYTERIAN',
    label: 'Methodist / Presbyterian (parish–society–diocese)',
    terms: { unit: 'Society', unitPlural: 'Societies', unitLeader: 'Reverend', gathering: 'Divine Service', leadershipBody: 'Session / Circuit' },
  },
  {
    key: 'CATHOLIC',
    label: 'Catholic (parish–diocese)',
    terms: { unit: 'Parish', unitPlural: 'Parishes', unitLeader: 'Parish Priest', gathering: 'Holy Mass', leadershipBody: 'Parish Pastoral Council' },
  },
  {
    key: 'APOSTOLIC',
    label: 'Apostolic / Foursquare (mission–area)',
    terms: { unit: 'Area', unitPlural: 'Areas', unitLeader: 'Apostle / Evangelist', gathering: 'Meeting', leadershipBody: 'Council of Ministers' },
  },
];
