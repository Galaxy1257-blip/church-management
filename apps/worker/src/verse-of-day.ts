// Verse-of-the-day SMS (R2): runs every day at 20:00 (8pm Accra) and sends to
// opted-in active members. Opt-out respected (source ANNOUNCEMENT is blocking);
// idempotent per member per day (vod:{church}:{yyyymmdd}:{memberId}); configured
// per church in Church.settings.devotional = { enabled, translation, verse }.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { withTenant, platformPrisma as prisma } from '@chms/db';
import { smsSegments, localDateKey, localizedSmsBody } from '@chms/shared';
import { Logger } from './log';

const log = new Logger('VerseOfDay');
const BIBLE_DIR = resolve(__dirname, '../../api/data/bible'); // apps/worker/dist -> apps/api/data/bible
const MAX_VS_CHARS = 450; // ~3 SMS segments cap

interface Devotional {
  enabled: boolean;
  translation?: string;
  verse?: string; // "John 3:16"; blank -> John 3:16
}

function loadVerse(translation: string, ref: string): { text: string; ref: string } | null {
  const file = resolve(BIBLE_DIR, `${translation.toLowerCase()}.json`);
  if (!existsSync(file)) return null;
  const bundle = JSON.parse(readFileSync(file, 'utf8')) as {
    books: { name: string; chapters: Record<string, string[]> }[];
  };
  const m = /^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/.exec(ref.trim());
  if (!m) return null;
  const book = bundle.books.find((b) => b.name.toLowerCase() === m[1].trim().toLowerCase())
    ?? bundle.books.find((b) => b.name.toLowerCase().startsWith(m[1].trim().toLowerCase()));
  if (!book) return null;
  const verses = book.chapters[m[2]];
  if (!verses) return null;
  const from = Number(m[3]);
  const to = m[4] ? Number(m[4]) : from;
  const picked: string[] = [];
  for (let n = from; n <= to; n++) if (verses[n - 1]) picked.push(verses[n - 1]);
  if (picked.length === 0) return null;
  const refOut = `${book.name} ${m[2]}:${from}${m[4] ? `-${m[4]}` : ''}`;
  const text = picked.join(' ');
  return { text: text.length > MAX_VS_CHARS ? `${text.slice(0, MAX_VS_CHARS - 1)}…` : text, ref: refOut };
}

export async function sendVerseOfDay(now = new Date()): Promise<{ churches: number; sent: number }> {
  const dateKey = localDateKey('Africa/Accra', now).replace(/-/g, ''); // 20261021
  const churches = await prisma.church.findMany({ select: { id: true, name: true, settings: true } });
  let sent = 0;
  let churchesDone = 0;

  for (const church of churches) {
    const dev = ((church.settings as any)?.devotional ?? {}) as Devotional;
    if (dev.enabled !== true) continue;
    const verse = loadVerse(dev.translation || 'kjv', dev.verse || 'John 3:16');
    if (!verse) {
      log.warn(`church=${church.id} devotional verse/translation not found — skipping`);
      continue;
    }
    const body = localizedSmsBody('devotional', ((church.settings as any)?.smsLocales ?? null), {
      text: verse.text,
      ref: verse.ref,
      translation: (dev.translation || 'kjv').toUpperCase(),
      churchName: church.name,
    });

    const members = await prisma.member.findMany({
      where: { churchId: church.id, deletedAt: null, status: 'ACTIVE', phoneE164: { not: null }, smsConsent: true },
      select: { id: true, phoneE164: true },
      take: 1000,
    });

    for (const member of members) {
      if (!member.phoneE164) continue;
      const ok = await reserveAndLog(church.id, member.phoneE164, body, `vod:${church.id}:${dateKey}:${member.id}`);
      if (ok) {
        sent++;
        const { enqueueSmsSend } = await import('./queue-helpers');
        enqueueSmsSend((await prisma.smsLog.findUnique({ where: { idempotencyKey: `vod:${church.id}:${dateKey}:${member.id}` } }))!.id);
      }
    }
    churchesDone++;
  }
  log.log(`verse-of-day: ${churchesDone} churches, ${sent} queued`);
  return { churches: churchesDone, sent };
}

/** Reserve + create SmsLog (ANNOUNCEMENT => opt-out respected via lookup below). */
async function reserveAndLog(churchId: string, toE164: string, body: string, idempotencyKey: string): Promise<boolean> {
  const segments = smsSegments(body);
  return withTenant(churchId, null, async (tx) => {
    const existing = await tx.smsLog.findUnique({ where: { idempotencyKey } });
    if (existing) return false;
    const optedOut = await tx.smsOptOut.findUnique({
      where: { churchId_phoneE164: { churchId, phoneE164: toE164 } },
    });
    if (optedOut) return false;
    const wallet = await tx.smsWallet.findUnique({ where: { churchId } });
    if ((wallet?.balanceUnits ?? 0) < segments) return false;
    const updated = await tx.smsWallet.updateMany({
      where: { churchId, balanceUnits: { gte: segments } },
      data: { balanceUnits: { decrement: segments }, reservedUnits: { increment: segments } },
    });
    if (updated.count === 0) return false;
    await tx.smsLedger.create({
      data: {
        churchId,
        delta: -segments,
        reason: 'RESERVE',
        balanceAfter: (wallet?.balanceUnits ?? 0) - segments,
        idempotencyKey: `reserve:${idempotencyKey}`,
      },
    });
    const row = await tx.smsLog.create({
      data: { churchId, source: 'ANNOUNCEMENT', toE164, body, segments, status: 'QUEUED', idempotencyKey },
    });
    await tx.smsLedger.update({ where: { idempotencyKey: `reserve:${idempotencyKey}` }, data: { refId: row.id } });
    return true;
  });
}
