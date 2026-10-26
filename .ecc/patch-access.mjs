// One-shot repair: put the NavGroup interface back together (the chunked writes
// split `hint`/`items` from the interface body).
import { readFileSync, writeFileSync } from 'node:fs';

const path = 'apps/web/src/lib/access.ts';
const raw = readFileSync(path, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
const lines = raw.split(/\r?\n/);

// sanity check the anchors before touching anything
const ok =
  lines[64] === '  label: string;' &&
  lines[129] === '  hint: string;' &&
  lines[184] === '  items: NavItem[];' &&
  lines[185] === '}';
if (!ok) {
  console.error('anchor mismatch', { l65: lines[64], l130: lines[129], l185: lines[184], l186: lines[185] });
  process.exit(1);
}

lines.splice(184, 2); // stray "items" + "}" at EOF
lines.splice(129, 2); // stray "hint" + blank before ROUTE_ACCESS
lines.splice(65, 0, '  hint: string;', '  items: NavItem[];', '}', '');
writeFileSync(path, lines.join(eol));
console.log('patched');
