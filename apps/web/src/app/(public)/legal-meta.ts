// One place for the facts both legal pages repeat, so a change of operator,
// contact or revision date cannot leave the two documents disagreeing.
export const LEGAL_UPDATED = '6 November 2026';
export const OPERATOR = 'OmniLabs Studios Pty';
export const CONTACT_EMAIL = 'app.omnilabs.dev@gmail.com';
export const APP_NAME = 'ChMS';

// Hosting and processing are currently on these providers. The owner plans to
// move off Neon/Render/Vercel later — when that happens, change the names here
// (and bump LEGAL_UPDATED) and every page that lists processors updates at once.
export const PROCESSORS = {
  database: 'Neon',
  api: 'Render',
  web: 'Vercel',
  payments: 'Paystack',
  sms: 'the SMS gateway the operator configures',
};