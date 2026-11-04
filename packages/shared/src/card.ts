// A member's door card belongs to ONE church. Member numbers are only unique
// inside a church, so a card that carries just "MEM-0001" would check in
// whoever holds that number in whichever assembly scans it. The payload names
// the church that issued the card, so the desk can refuse a foreign card by
// name instead of quietly matching the wrong person.
const CARD_PREFIX = 'chms-card://';

export interface CardScan {
  slug: string;
  ref: string;
}

/** The text a member's card QR holds: the issuing church plus their card reference. */
export function cardPayload(slug: string, ref: string): string {
  return `${CARD_PREFIX}${slug.trim().toLowerCase()}/${ref.trim()}`;
}

/** null for anything that is not a card (a typed member number or phone still works). */
export function parseCardScan(text: string): CardScan | null {
  const t = (text ?? '').trim();
  if (!t.toLowerCase().startsWith(CARD_PREFIX)) return null;
  const rest = t.slice(CARD_PREFIX.length);
  const sep = rest.indexOf('/');
  if (sep < 0) return null;
  const slug = rest.slice(0, sep).trim().toLowerCase();
  const ref = rest.slice(sep + 1).trim();
  if (!slug || !ref) return null;
  return { slug, ref };
}
