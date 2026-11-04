// Mirrors packages/shared/src/card.ts — the web app cannot import @chms/shared.
// A member's card QR names the church that issued it, so the door can tell a
// foreign card apart from one of its own.
const CARD_PREFIX = 'chms-card://';

export function cardPayload(slug: string, ref: string): string {
  return `${CARD_PREFIX}${slug.trim().toLowerCase()}/${ref.trim()}`;
}
