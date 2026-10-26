// Fails (exit 1) if anything that looks like a real API secret is committed.
// Run before every export: npm run check:secrets
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', '.git', 'coverage', 'migrations']);
// Each pattern carries the reason it exists, so a hit is actionable.
// `ignore` is tested against the captured group for the generic pattern only:
// dev/example/test values are documented defaults, not leaks.
const PATTERNS = [
  { name: 'cSMS token', re: /csms_[A-Za-z0-9]{20,}/ }, // cSMS API tokens
  { name: 'Paystack live key', re: /sk_live_[A-Za-z0-9]{10,}/ }, // live secret keys
  { name: 'Paystack test key', re: /sk_test_[A-Za-z0-9]{20,}/ }, // test keys with real entropy
  { name: 'AWS access key', re: /AKIA[0-9A-Z]{16}/ }, // AWS access keys
  // Connection strings that embed a password. The localhost dev DSN in
  // .env.example / docker-compose is allowed on purpose.
  {
    name: 'DSN with password',
    re: /\b(?:postgres|postgresql|mysql|redis|rediss|mongodb|mongodb\+srv):\/\/[^\s"'`/:@]+:[^\s"'`/@]+@(?!localhost\b|127\.0\.0\.1\b)/,
    // Docs describe the shape with placeholders (postgresql://USER:<PASSWORD>@<HOST>/db).
    // Those are instructions, not credentials.
    ignore: /[<>{}%$]|\buser\b|\bpass(word)?\b|example|placeholder|changeme/i,
  },
  // Neon (the provider this project uses) exposes generated passwords as npg_…
  { name: 'Neon password', re: /npg_[A-Za-z0-9]{12,}/ },
  // Generic hardcoded assignments. Unquoted .env lines do not match — those are
  // read from the environment, not baked in. The key pattern allows a prefix
  // (`SMS_PASSWORD`, `PAYSTACK_SECRET_KEY`): a plain `\bPASSWORD` misses them
  // because `_` is a word character, so the most common real-world names slipped
  // through until the negative test planted one.
  {
    name: 'hardcoded secret',
    re: /[A-Za-z0-9_]*(?:SECRET|PASSWORD|PASSWD|API_KEY|APIKEY|PRIVATE_KEY|ACCESS_TOKEN|AUTH_TOKEN)\s*[:=]\s*['"`]([^'"`\s]{16,})['"`]/i,
    ignore:
      /dev|change|test|integration|example|sample|placeholder|dummy|local|fake|mock|fixture|stub|xxxx/i,
  },
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
    for (const { name, re, ignore } of PATTERNS) {
      const m = re.exec(text);
      if (!m) continue;
      if (ignore && ignore.test(m[1] ?? m[0])) continue;
      hits.push(`${full.replace(ROOT + '\\', '')}: [${name}] ${m[0].slice(0, 12)}…`);
    }
  }
}

scan(ROOT);
if (hits.length > 0) {
  console.error('POSSIBLE SECRETS FOUND — remove before export:');
  for (const h of hits) console.error('  ' + h);
  process.exit(1);
}
console.log('check:secrets clean — no API keys or credentialed DSNs found in the tree.');
