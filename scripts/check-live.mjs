#!/usr/bin/env node
// npm run live:check
//
// The stack lives in three places at once: this repo, a Render dashboard, and a
// Vercel dashboard. Only the first one is versioned, so the other two are where
// things quietly go missing — a deleted NEXT_PUBLIC_API_URL, a service rebuilt
// without a secret, a host renamed. This script reads live-manifest.json, proves
// the manifest still covers everything render.yaml is waiting for, and then asks
// the running services whether they agree with each other.
//
//   npm run live:check            manifest drift + the live stack
//   npm run live:check --offline  only what git can prove (safe in CI)
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OFFLINE = process.argv.includes('--offline');
const manifest = JSON.parse(readFileSync(resolve(ROOT, 'live-manifest.json'), 'utf8'));

const results = [];
const pass = (id, detail) => results.push({ ok: true, id, detail });
const fail = (id, detail, fix) => results.push({ ok: false, id, detail, fix });

/** render.yaml's `sync: false` vars are the ones Render is waiting on us for. */
function blueprintIsWaitingFor(text) {
  const pending = [];
  let service = null;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const name = lines[i].match(/^ {4}name: (\S+)/); // a service, not a nested fromService ref
    if (name) service = name[1];
    const key = lines[i].match(/^ {6}- key: (\S+)/);
    if (!key || !service) continue;
    for (let j = i + 1; j < lines.length; j += 1) {
      if (/^ {6}- key: /.test(lines[j])) break;
      if (/^ {8}sync: false/.test(lines[j])) {
        pending.push({ service, key: key[1] });
        break;
      }
    }
  }
  return pending;
}

function checkManifestDrift() {
  let text;
  try {
    text = readFileSync(resolve(ROOT, 'render.yaml'), 'utf8');
  } catch {
    fail('manifest-drift', 'render.yaml is missing', 'restore it; the whole topology is described there');
    return;
  }
  const pending = blueprintIsWaitingFor(text);
  if (pending.length === 0) {
    fail('manifest-drift', 'no services with sync:false found in render.yaml', 'the parser is out of date with the file format — fix blueprintIsWaitingFor, do not trust this result');
    return;
  }
  const written = new Set(manifest.mustBeCopiedByHand.map((e) => `${e.service}|${e.key}`));
  const missing = pending.filter((p) => !written.has(`${p.service}|${p.key}`));
  if (missing.length > 0) {
    fail(
      'manifest-drift',
      `${missing.map((m) => `${m.service}.${m.key}`).join(', ')} are awaited by render.yaml but not written down`,
      'add each one to live-manifest.json (mustBeCopiedByHand): where the value lives, what breaks without it. Never the value itself.',
    );
    return;
  }
  const stale = manifest.mustBeCopiedByHand
    .filter((e) => e.service.startsWith('chms-'))
    .filter((e) => !pending.some((p) => p.service === e.service && p.key === e.key));
  pass(
    'manifest-drift',
    `${pending.length} dashboard values accounted for${stale.length ? ` (${stale.map((s) => `${s.service}.${s.key}`).join(', ')} no longer awaited — tidy the manifest)` : ''}`,
  );
}

async function get(url, opts = {}) {
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(opts.timeoutMs ?? 45_000), redirect: 'manual' });
  return res;
}

async function checkLiveStack() {
  const { api, apiBase, web, jobs } = manifest.hosts;

  // 1. API + database
  try {
    const res = await get(`${apiBase}/health`);
    const body = await res.json();
    if (res.status === 200 && body.db === 'up') pass('api-health', `API online, database up (${body.ts})`);
    else fail('api-health', `API answered ${res.status} with db=${String(body.db)}`, 'check chms-api on Render: deploy log first, then DATABASE_URL');
  } catch (err) {
    fail('api-health', `could not reach ${apiBase}/health: ${String(err)}`, 'a free instance sleeps — wake it and retry; a real outage shows in the Render deploy log');
  }

  // 2. Bible bundles actually shipped
  try {
    const res = await get(`${apiBase}/bible/daily`);
    const body = await res.json().catch(() => ({}));
    if (res.status === 200 && body.ref && body.text) pass('bible-daily', `${body.translation}: ${body.ref}`);
    else fail('bible-daily', `HTTP ${res.status}: ${JSON.stringify(body).slice(0, 120)}`, 'kjv.json is committed — if it is gone from the tree, the Bible broke in git, not on the server');
  } catch (err) {
    fail('bible-daily', `request failed: ${String(err)}`, 'same as api-health');
  }

  // 3. CORS: the staff app must not be silently blocked
  try {
    const res = await get(`${apiBase}/auth/login`, {
      method: 'OPTIONS',
      timeoutMs: 20_000,
      headers: { Origin: web, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' },
    });
    const allow = res.headers.get('access-control-allow-origin');
    if (allow === web || allow === '*') pass('cors', `the API accepts ${web}`);
    else fail('cors', `preflight from ${web} returned ${res.status} with allow-origin=${String(allow)}`, `set WEB_URL on chms-api to ${web}`);
  } catch (err) {
    fail('cors', `preflight failed: ${String(err)}`, 'check the API is up');
  }

  // 4. the built bundle points at the live API (NEXT_PUBLIC_* is frozen at build)
  try {
    const page = await get(`${web}/login`);
    const html = await page.text();
    const chunks = [...new Set(html.match(/\/_next\/static\/[^"]+?\.js/g) ?? [])].slice(0, 20);
    if (chunks.length === 0) {
      fail('bundle-api-url', `no JS chunks found in ${web}/login (HTTP ${page.status})`, 'the page itself is broken; fix that before reading this check');
    } else {
      const want = new URL(api).host;
      let found = null;
      for (const chunk of chunks) {
        const src = await get(`${web}${chunk}`, { timeoutMs: 20_000 }).catch(() => null);
        if (!src) continue;
        const text = await src.text();
        if (text.includes(want)) { found = chunk; break; }
      }
      if (found) pass('bundle-api-url', `the shipped JS calls ${want}`);
      else fail('bundle-api-url', `none of the ${chunks.length} chunks downloaded from ${web} mention ${want}`, `NEXT_PUBLIC_API_URL on Vercel is not ${apiBase} — set it and redeploy (a restart is not enough; it is baked in at build)`);
    }
  } catch (err) {
    fail('bundle-api-url', `could not read the live web app: ${String(err)}`, 'is the Vercel deployment still on this repo and branch?');
  }

  // 5 + 6. the jobs service
  try {
    const res = await get(`${jobs}/health`);
    const body = await res.json().catch(() => ({}));
    if (res.status === 200 && body.service) {
      const gaps = (body.missing ?? []).join('; ');
      pass('jobs-health', `gateway=${body.gateway}, redis=${body.redis}, token=${String(body.tickTokenConfigured)}${gaps ? ` — still to fix: ${gaps}` : ''}`);
    } else {
      fail('jobs-health', `chms-jobs answered ${res.status}`, 'it is a new service: check the Render deploy log and that the four dashboard values are pasted in');
    }
  } catch (err) {
    fail('jobs-health', `could not reach ${jobs}: ${String(err)}`, 'the service may not exist yet, or Render assigned it a different hostname — update live-manifest.json hosts');
  }

  try {
    const res = await get(`${jobs}/tick`, { method: 'POST', timeoutMs: 20_000 });
    if (res.status === 401) pass('jobs-fail-closed', 'a tick without the token is refused');
    else fail('jobs-fail-closed', `an unauthenticated POST /tick answered ${res.status}`, 'this endpoint must answer 401 with no token; anything else lets a stranger run your jobs');
  } catch (err) {
    fail('jobs-fail-closed', `request failed: ${String(err)}`, 'see jobs-health');
  }
}

checkManifestDrift();
if (OFFLINE) pass('offline', 'skipped the live stack; run without --offline to check Render and Vercel');
else await checkLiveStack();

console.log('\nLive stack check\n================\n');
for (const r of results) {
  console.log(`${r.ok ? '  ok  ' : ' FAIL '} ${r.id}: ${r.detail}`);
  if (!r.ok && r.fix) console.log(`        → ${r.fix}`);
}

console.log(`\n${manifest.notSecretsButEasyToLose.length} facts that are not secrets but have no file of their own:`);
for (const note of manifest.notSecretsButEasyToLose) console.log(`  · ${note}`);

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed.\n`);
process.exit(failed > 0 ? 1 : 0);
