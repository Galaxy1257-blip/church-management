// Money + date formatting helpers (client-safe; no @chms/shared runtime dep
// because that package imports node:crypto).

/**
 * The one way money is shown on a screen or in a PDF: the sign Ghanaians
 * actually write, with thousands separators. The API's SMS formatter keeps the
 * plain-ASCII "GHS" on purpose — ₵ is not in the GSM-7 alphabet, so one cedi
 * sign would flip a giving receipt to UCS-2 and cut it from 160 to 70 characters.
 */
export function ghs(minor: number): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const cedis = Math.floor(abs / 100).toLocaleString('en-US');
  return `${sign}GH₵ ${cedis}.${String(abs % 100).padStart(2, '0')}`;
}

/** "12.34" -> 1234 pesewas; returns null when invalid. */
export function toPesewas(input: string): number | null {
  const s = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  return Number(whole) * 100 + Number((frac + '00').slice(0, 2));
}

export function fmtDate(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
