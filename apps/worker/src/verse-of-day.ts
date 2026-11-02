// Verse-of-the-day SMS (R2): runs every day at 20:00 (8pm Accra) and sends to
// opted-in active members. Opt-out respected (source ANNOUNCEMENT is blocking);
// idempotent per member per day (vod:{church}:{yyyymmdd}:{memberId}). Configured
// per church in Church.settings.devotional — a blank `verse` means the passage
// rotates through DAILY_READINGS instead of repeating one verse forever.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { withTenant, platformPrisma as prisma } from '@chms/db';
import {
  dailyReadingFor,
  localizedSmsBody,
  localDateKey,
  readVerse,
  resolveDevotional,
  smsSegments,
} from '@chms/shared';
import { Logger } from './log';

const log = new Logger('VerseOfDay');
const BIBLE_DIR = resolve(__dirname, '../../api/data/bible'); // apps/worker/dist -> apps/api/data/bible
const MAX_VS_CHARS = 450; // ~3 SMS segments cap

function loadVerse(translation: string, ref: string): { text: string; ref: string } | null {
  const file = resolve(BIBLE_DIR, `${translation.toLowerCase()}.json`);
  if (!existsSync(file)) return null;
  const bundle = JSON.parse(readFileSync(file, 'utf8')) as {
    books: { name: string; chapters: Record<string, string[]> }[];
  };
  return readVerse(bundle.books, ref, MAX_VS_CHARS);
}

export async function sendVerseOfDay(now = new Date()): Promise<{ churches: number; sent: number }> {
  const dayKey = localDateKey('Africa/Accra', now); // 2026-11-02
  const dateKey = dayKey.replace(/-/g, ''); // 20261102
  const churches = await prisma.church.findMany({ select: { id: true, name: true, settings: true } });
  let sent = 0;
  let churchesDone = 0;

  for (const church of churches) {
    const dev = resolveDevotional((church.settings as any)?.devotional);
    if (!dev.enabled) continue;
    const today = dailyReadingFor(dayKey);
    const ref = dev.verse || today.ref;
    const verse = loadVerse(dev.translation, ref);
    if (!verse) {
      log.warn(`church=${church.id} devotional verse "${ref}" not found in ${dev.translation} — skipping`);
      continue;
    }
    const body = localizedSmsBody('devotional', ((church.settings as any)?.smsLocales ?? null), {
      text: verse.text,
      ref: verse.ref,
      translation: dev.translation.toUpperCase(),
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
