// Fails (exit 1) if anything that looks like a real API secret is committed.
// Run before every export: npm run check:secrets
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', '.git', 'coverage', 'migrations']);
const PATTERNS = [
  /csms_[A-Za-z0-9]{20,}/, // cSMS API tokens
  /sk_live_[A-Za-z0-9]{10,}/, // Paystack live secret keys
  /sk_test_[A-Za-z0-9]{20,}/, // Paystack test secret with real entropy
  /AKIA[0-9A-Z]{16}/, // AWS access keys
];

const hits = [];

function scan(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      scan(full);
      continue;
    }
    if (!/\.(ts|tsx|js|mjs|cjs|json|md|yml|yaml|sql|prisma|example)$/.test(entry)) continue;
    const text = readFileSync(full, 'utf8');
    for (const re of PATTERNS) {
      const m = re.exec(text);
      if (m) hits.push(`${full.replace(ROOT + '\\', '')}: ${m[0].slice(0, 12)}…`);
    }
  }
}

scan(ROOT);
if (hits.length > 0) {
  console.error('POSSIBLE SECRETS FOUND — remove before export:');
  for (const h of hits) console.error('  ' + h);
  process.exit(1);
}
console.log('check:secrets clean — no API keys found in the tree.');
