// The free-plan shape of the worker. Render refuses `type: worker` on the free
// tier, so nothing here would ever run — instead this process holds one tiny
// HTTP endpoint and GitHub Actions cron pokes it.
//
// Cadence is a budget decision, not a technical one: Render gives a workspace
// 750 free instance hours a month and a free instance stays awake 15 minutes
// after the last request. A tick every 5 minutes would keep this service awake
// around the clock and use the whole quota by itself, which suspends the API and
// the staff app too. Ten ticks a day (~80 hours) is the deal; jobs that are
// late by an hour are still delivered, and none of them sends before 06:00.
//
// It is NOT a scheduler. It has no clock of its own: a tick asks "what is due
// right now in Accra?" and runs exactly that, with a short-lived Redis lock per
// job so a retried or delayed tick cannot send the same verse twice.
//
// main.ts is the always-on shape (paid worker). Only one of the two should be
// deployed at a time — running both would double-register the repeatables.
import './load-root-env'; // root .env first — npm -w runs with cwd apps/worker
import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { loadWorkerEnv } from './env';
import { startConsumers } from './consumers';
import { runMaintenance } from './maintenance';
import { accraNow, planDue } from './tick-schedule';
import { getSmsGateway } from './sms-gateway';
import { Logger } from './log';

const env = loadWorkerEnv();
const logger = new Logger('Tick');
const { connection, queues, close } = startConsumers(env);

/** Constant-time compare without leaking length: hash both, then compare. */
function tokenOk(header: string | undefined): boolean {
  if (!env.JOBS_TICK_TOKEN) return false;
  if (!header) return false;
  const a = createHash('sha256').update(header).digest();
  const b = createHash('sha256').update(env.JOBS_TICK_TOKEN).digest();
  return timingSafeEqual(a, b);
}

let running = false;

/** ioredis queues commands forever (maxRetriesPerRequest: null), so a dead
 * Redis would hang /health and every lock attempt — and Render would mark this
 * service unhealthy. Every Redis call races a deadline. */
async function withDeadline<T>(call: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${String(ms)}ms`)), ms);
  });
  try {
    return await Promise.race([call, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function runDue(now: Date): Promise<Record<string, unknown>> {
  const t = accraNow(now);
  const ran: Array<{ job: string; why: string; result: unknown }> = [];
  const skipped: Array<{ job: string; reason: string }> = [];

  for (const item of planDue(t)) {
    if (!item.lockKey) {
      skipped.push({ job: item.job, reason: item.skipReason ?? 'not due' });
      continue;
    }
    let won: 'OK' | null;
    try {
      won = await withDeadline(connection.set(item.lockKey, String(now.getTime()), 'EX', item.lockSeconds, 'NX'), 4000, 'redis lock');
    } catch (err) {
      // The SET may still land after the deadline, which would hold that slot
      // shut while nothing ran — so try to give it back.
      await withDeadline(connection.del(item.lockKey), 2000, 'redis release').catch(() => undefined);
      skipped.push({ job: item.job, reason: `redis lock unavailable: ${String(err)}` });
      continue;
    }
    if (won !== 'OK') {
      skipped.push({ job: item.job, reason: 'already ran in this slot' });
      continue;
    }
    try {
      ran.push({ job: item.job, why: item.why, result: await runMaintenance(item.job, queues) });
    } catch (err) {
      // Release the lock so the next tick can retry a job that failed on a
      // transient (a gateway blip) instead of losing the whole slot.
      await withDeadline(connection.del(item.lockKey), 2000, 'redis release').catch(() => undefined);
      skipped.push({ job: item.job, reason: `failed, will retry next tick: ${String(err)}` });
      logger.error(`${item.job} failed: ${String(err)}`);
    }
  }
  return {
    ok: true,
    accra: `${t.date} ${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`,
    ran,
    skipped,
  };
}

async function status(): Promise<Record<string, unknown>> {
  let gateway = 'unknown';
  try {
    gateway = (await withDeadline(getSmsGateway(), 5000, 'gateway lookup')).name;
  } catch (err) {
    gateway = `error: ${String(err)}`;
  }
  let redis = 'down';
  try {
    redis = (await withDeadline(connection.ping(), 2000, 'redis ping')) === 'PONG' ? 'up' : 'down';
  } catch {
    /* unreachable — /health still answers */
  }
  const missing: string[] = [];
  if (!env.JOBS_TICK_TOKEN) missing.push('JOBS_TICK_TOKEN — without it every /tick is a 401 and no job can run');
  if (gateway === 'mock') missing.push('SMS_GATEWAY=mock — messages are recorded, never delivered to a phone');
  return { ok: missing.length === 0, service: 'chms-jobs', gateway, paystack: env.PAYSTACK_MODE, redis, tickTokenConfigured: Boolean(env.JOBS_TICK_TOKEN), missing };
}

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  req.resume(); // drain the body so the socket closes cleanly; jobs take no input
  const send = (code: number, body: unknown): void => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
    res.end(`${JSON.stringify(body)}\n`);
  };
  const url = (req.url ?? '').split('?')[0];

  if (url === '/health') {
    void status().then((s) => send(200, s), (err) => send(500, { ok: false, error: String(err) }));
    return;
  }
  if (url === '/tick') {
    if (req.method !== 'POST') {
      send(405, { ok: false, error: 'use POST' });
      return;
    }
    if (!tokenOk(req.headers['x-jobs-token'] as string | undefined)) {
      // Fail closed with no hint of why — the token being unset is a deploy
      // mistake, not something to advertise to a stranger.
      logger.warn('tick refused (no token or JOBS_TICK_TOKEN unset)');
      send(401, { ok: false, error: 'unauthorized' });
      return;
    }
    if (running) {
      send(200, { ok: true, ran: [], skipped: [{ job: 'tick', reason: 'a previous tick is still running' }] });
      return;
    }
    running = true;
    void runDue(new Date())
      .then((report) => {
        logger.log(`tick ran ${String((report as { ran: unknown[] }).ran.length)} job(s)`);
        send(200, report);
      })
      .catch((err: unknown) => {
        logger.error(`tick threw: ${String(err)}`);
        send(500, { ok: false, error: String(err) });
      })
      .finally(() => {
        running = false;
      });
    return;
  }
  send(404, { ok: false, error: 'not found' });
});

server.listen(env.PORT, () => {
  logger.log(`tick server on :${String(env.PORT)} (gateway=${env.SMS_GATEWAY}, paystack=${env.PAYSTACK_MODE})`);
});

const shutdown = async (signal: string): Promise<void> => {
  logger.log(`received ${signal}, closing...`);
  server.close();
  await close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
