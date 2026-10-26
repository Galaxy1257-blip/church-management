// One-shot repair: drop the duplicated refresh-audience test block that ended up
// after the JwtAuthGuard describe() close (keep the first copy + the describe close).
import { readFileSync, writeFileSync } from 'node:fs';

const path = 'apps/api/src/common/guards.spec.ts';
const raw = readFileSync(path, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
const lines = raw.split(/\r?\n/);

const marker = "  it('rejects refresh-audience tokens used as access tokens', async () => {";
const last = lines.lastIndexOf(marker);
if (last === -1) {
  console.error('marker missing');
  process.exit(1);
}
let cut = last;
while (cut > 0 && lines[cut - 1].trim() === '') cut--;
const kept = lines.slice(0, cut);
if (kept[kept.length - 1] !== '});') {
  console.error('unexpected cut point', kept.slice(-3));
  process.exit(1);
}
writeFileSync(path, `${kept.join(eol)}${eol}`);
console.log('kept', kept.length, 'lines');
