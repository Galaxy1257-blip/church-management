import * as webpush from 'web-push';
import { platformPrisma as prisma, withTenant } from '@chms/db';
import {
  effectiveModules,
  hasPermission,
  normalizeGhPhone,
  permissionsForRoles,
  resolveModules,
  smsQuietHoursBlocked,
  smsSegments,
  type RoleKey,
} from '@chms/shared';
import { Logger } from './log';
import { enqueueSmsSend } from './queue-helpers';

const log = new Logger('Announcements');
const DAY_MS = 86_400_000;
const LEASE_MS = 10 * 60_000;
const MAX_ATTEMPTS = 3;
const PUSH_TIMEOUT_MS = 5_000;
const PUSH_CONCURRENCY = 20;

interface DeliveryContext {
  now: Date;
  cancelledAt: Date | null;
  moderation: string;
  publishAt: Date;
  expiresAt: Date | null;
  creator: { isActive: boolean; roles: Array<{ role: { key: string } }> } | null;
  reachEnabled: boolean;
  billingLocked: boolean;
  channel: string;
  pushEnabled: boolean;
  pushConfigured: boolean;
}

export type DeliveryDecision =
  | { kind: 'send' }
  | { kind: 'reschedule'; dueAt: Date }
  | { kind: 'skip' | 'cancel'; reason: string };

export function billingIsLocked(
  church: {
    billingLocked: boolean;
    billingExempt: boolean;
    paidUntil: Date | null;
    trialEndsAt: Date | null;
    graceDays: number;
  },
  now: Date,
): boolean {
  if (church.billingLocked) return true;
  if (church.billingExempt) return false;
  const paid = church.paidUntil;
  const trial = church.trialEndsAt;
  const coveredUntil = paid && trial ? (paid > trial ? paid : trial) : (paid ?? trial);
  if (!coveredUntil) return false;
  return now.getTime() >= coveredUntil.getTime() + church.graceDays * DAY_MS;
}

export function deliveryDecision(input: DeliveryContext): DeliveryDecision {
  if (input.cancelledAt) return { kind: 'cancel', reason: 'The announcement was cancelled.' };
  if (input.moderation !== 'APPROVED') return { kind: 'skip', reason: 'The announcement is not approved.' };
  if (input.publishAt > input.now) return { kind: 'reschedule', dueAt: input.publishAt };
  if (input.expiresAt && input.expiresAt <= input.now) return { kind: 'skip', reason: 'The announcement has expired.' };
  if (!input.creator?.isActive) return { kind: 'skip', reason: 'The sender is no longer active.' };
  const roles = input.creator.roles.map((r) => r.role.key as RoleKey);
  if (!hasPermission(permissionsForRoles(roles), 'campaigns:write')) {
    return { kind: 'skip', reason: 'The sender no longer has permission to publish announcements.' };
  }
  if (!input.reachEnabled) return { kind: 'skip', reason: 'News is switched off for this church.' };
  if (input.billingLocked) return { kind: 'skip', reason: 'The church workspace is paused.' };
  if (input.channel !== 'INAPP' && input.channel !== 'PUSH' && input.channel !== 'SMS') {
    return { kind: 'skip', reason: 'This channel is not supported for scheduled announcements.' };
  }
  if (input.channel === 'PUSH' && (!input.pushConfigured || !input.pushEnabled)) {
    return { kind: 'skip', reason: input.pushConfigured ? 'Phone notifications are switched off.' : 'Phone notifications are not configured.' };
  }
  return { kind: 'send' };
}

export function retryAt(now: Date, attempts: number): Date {
  return new Date(now.getTime() + Math.min(60_000 * 2 ** Math.max(0, attempts - 1), 15 * 60_000));
}

export function safeDeliveryError(error: unknown, fallback: string): string {
  const statusCode = (error as { statusCode?: unknown } | null)?.statusCode;
  if (typeof statusCode === 'number' && Number.isInteger(statusCode) && statusCode >= 100 && statusCode <= 599) {
    return `The push service returned ${String(statusCode)}.`;
  }
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && /^[A-Z0-9_]{1,32}$/.test(code)) return `${fallback} (${code})`;
  return fallback;
}

function vapidKeys(): { subject: string; publicKey: string; privateKey: string } | null {
  const subject = process.env.VAPID_SUBJECT ?? '';
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? '';
  const privateKey = process.env.VAPID_PRIVATE_KEY ?? '';
  return subject && publicKey && privateKey ? { subject, publicKey, privateKey } : null;
}

async function finish(
  churchId: string,
  deliveryId: string,
  leaseUntil: Date,
  data: {
    status: string;
    sentAt?: Date | null;
    lastError?: string | null;
    nextAttemptAt?: Date | null;
    dueAt?: Date;
    attempts?: number;
    leaseUntil?: null;
  },
): Promise<boolean> {
  const updated = await withTenant(churchId, null, (tx) =>
    tx.announcementDelivery.updateMany({
      where: { id: deliveryId, churchId, status: 'PROCESSING', leaseUntil },
      data: { ...data, leaseUntil: null },
    }),
  );
  return updated.count === 1;
}

async function failOrRetry(
  churchId: string,
  deliveryId: string,
  leaseUntil: Date,
  attempts: number,
  now: Date,
  reason: string,
): Promise<void> {
  const terminal = attempts >= MAX_ATTEMPTS;
  await finish(churchId, deliveryId, leaseUntil, {
    status: terminal ? 'FAILED' : 'PENDING',
    lastError: reason,
    nextAttemptAt: terminal ? null : retryAt(now, attempts),
  });
}

async function deliverInApp(
  churchId: string,
  announcementId: string,
  createdBy: string,
  title: string,
  body: string,
  scheduledFor: Date,
  deliveryId: string,
  leaseUntil: Date,
  now: Date,
): Promise<void> {
  await withTenant(churchId, null, async (tx) => {
    await tx.notification.upsert({
      where: { churchId_dedupeKey: { churchId, dedupeKey: `announcement:${announcementId}:inapp` } },
      create: {
        churchId,
        kind: 'ANNOUNCEMENT',
        title,
        body,
        sourceId: announcementId,
        scheduledFor,
        sentAt: now,
        createdBy,
        dedupeKey: `announcement:${announcementId}:inapp`,
      },
      update: {},
    });
    await tx.announcementDelivery.updateMany({
      where: { id: deliveryId, churchId, status: 'PROCESSING', leaseUntil },
      data: { status: 'SENT', sentAt: now, lastError: null, nextAttemptAt: null, leaseUntil: null },
    });
  });
}

async function deliverPush(
  churchId: string,
  announcementId: string,
  title: string,
  body: string,
  deliveryId: string,
  leaseUntil: Date,
  attempts: number,
  now: Date,
): Promise<void> {
  const keys = vapidKeys();
  if (!keys) {
    await finish(churchId, deliveryId, leaseUntil, { status: 'SKIPPED', lastError: 'Phone notifications are not configured.' });
    return;
  }
  const subscriptions = await withTenant(churchId, null, (tx) =>
    tx.pushSubscription.findMany({
      where: { churchId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    }),
  );
  if (!subscriptions.length) {
    await finish(churchId, deliveryId, leaseUntil, { status: 'SKIPPED', lastError: 'No phones are subscribed.' });
    return;
  }

  const payload = JSON.stringify({ title, body, url: '/portal', tag: `announcement:${announcementId}` });
  const dead: string[] = [];
  let sent = 0;
  let failed = 0;
  let lastError = 'Some phones could not be reached.';

  for (let offset = 0; offset < subscriptions.length; offset += PUSH_CONCURRENCY) {
    await Promise.all(
      subscriptions.slice(offset, offset + PUSH_CONCURRENCY).map(async (subscription) => {
        try {
          await webpush.sendNotification(
            { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
            payload,
            { vapidDetails: keys, timeout: PUSH_TIMEOUT_MS, TTL: 86_400, urgency: 'high' },
          );
          sent++;
        } catch (error) {
          const statusCode = (error as { statusCode?: number } | null)?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            dead.push(subscription.id);
          } else {
            failed++;
            lastError = safeDeliveryError(error, 'Some phones could not be reached.');
          }
        }
      }),
    );
  }

  if (dead.length) {
    await withTenant(churchId, null, (tx) => tx.pushSubscription.deleteMany({ where: { id: { in: dead }, churchId } }));
  }
  if (sent > 0) {
    await finish(churchId, deliveryId, leaseUntil, {
      status: sent + dead.length === subscriptions.length ? 'SENT' : 'PARTIAL',
      sentAt: now,
      lastError: failed ? `${String(failed)} phone(s) could not be reached.` : null,
    });
    return;
  }
  if (!failed) {
    await finish(churchId, deliveryId, leaseUntil, { status: 'SKIPPED', lastError: 'No subscribed phones are still active.' });
    return;
  }
  await failOrRetry(churchId, deliveryId, leaseUntil, attempts, now, lastError);
}

export type EnqueueAnnouncementSms = (logId: string) => void | Promise<unknown>;

function smsLogPrefix(announcementId: string): string {
  return `announcement:${announcementId}:sms:`;
}

async function deliverAnnouncementSms(
  churchId: string,
  announcement: { id: string; title: string; body: string },
  deliveryId: string,
  leaseUntil: Date,
  now: Date,
  enqueue: EnqueueAnnouncementSms,
): Promise<void> {
  const body = `${announcement.title}: ${announcement.body}`;
  const segments = smsSegments(body);
  if (segments > 10) {
    await finish(churchId, deliveryId, leaseUntil, { status: 'SKIPPED', lastError: 'The SMS is longer than 10 text segments.' });
    return;
  }

  const prefix = smsLogPrefix(announcement.id);
  const materialized = await withTenant(churchId, null, async (tx) => {
    const church = await tx.church.findUnique({
      where: { id: churchId },
      select: { settings: true, timezone: true },
    });
    if (!church) return { kind: 'skip' as const, reason: 'The church no longer exists.' };
    if (smsQuietHoursBlocked(church.settings, church.timezone, now)) {
      return { kind: 'wait' as const, reason: 'Waiting for the church’s quiet hours to end.' };
    }

    const existing = await tx.smsLog.findMany({
      where: { idempotencyKey: { startsWith: prefix } },
      select: { id: true, status: true },
    });
    if (existing.length) return { kind: 'existing' as const, logs: existing };

    const [optedOutRows, members] = await Promise.all([
      tx.smsOptOut.findMany({ where: { churchId }, select: { phoneE164: true } }),
      tx.member.findMany({
        where: { churchId, deletedAt: null, status: 'ACTIVE', phoneE164: { not: null }, smsConsent: true },
        select: { phoneE164: true },
      }),
    ]);
    const optedOut = new Set(
      optedOutRows.map((row) => {
        try { return normalizeGhPhone(row.phoneE164); } catch { return row.phoneE164; }
      }),
    );
    const phones = new Set<string>();
    for (const member of members) {
      if (!member.phoneE164) continue;
      try {
        const phone = normalizeGhPhone(member.phoneE164);
        if (!optedOut.has(phone)) phones.add(phone);
      } catch {
        // An invalid stored phone cannot receive a text; other members still can.
      }
    }
    if (!phones.size) return { kind: 'skip' as const, reason: 'No active members who agreed to SMS are eligible.' };

    const wallet = await tx.smsWallet.findUnique({ where: { churchId }, select: { balanceUnits: true } });
    const affordable = Math.min(phones.size, Math.floor((wallet?.balanceUnits ?? 0) / segments));
    if (!affordable) return { kind: 'skip' as const, reason: 'No SMS credits are available.' };
    const recipients = [...phones].slice(0, affordable);
    const units = recipients.length * segments;
    const reserved = await tx.smsWallet.updateMany({
      where: { churchId, balanceUnits: { gte: units } },
      data: { balanceUnits: { decrement: units }, reservedUnits: { increment: units } },
    });
    if (!reserved.count) return { kind: 'skip' as const, reason: 'No SMS credits are available.' };

    await tx.smsLog.createMany({
      data: recipients.map((phone) => ({
        churchId,
        source: 'ANNOUNCEMENT' as const,
        toE164: phone,
        body,
        segments,
        status: 'QUEUED' as const,
        idempotencyKey: `${prefix}${phone}`,
      })),
      skipDuplicates: true,
    });
    const logs = await tx.smsLog.findMany({
      where: { idempotencyKey: { startsWith: prefix } },
      select: { id: true, idempotencyKey: true },
    });
    const walletAfterReservation = await tx.smsWallet.findUnique({ where: { churchId }, select: { balanceUnits: true } });
    if (!walletAfterReservation) throw new Error('SMS wallet disappeared during reservation.');
    let balanceAfter = walletAfterReservation.balanceUnits + logs.length * segments;
    await tx.smsLedger.createMany({
      data: logs.map((row) => {
        balanceAfter -= segments;
        return {
          churchId,
          delta: -segments,
          reason: 'RESERVE' as const,
          refType: 'SMS_LOG',
          refId: row.id,
          balanceAfter,
          idempotencyKey: `reserve:${row.idempotencyKey}`,
        };
      }),
      skipDuplicates: true,
    });
    return {
      kind: 'queued' as const,
      logs,
      eligible: phones.size,
      shortfall: phones.size - logs.length,
    };
  });

  if (materialized.kind === 'skip') {
    await finish(churchId, deliveryId, leaseUntil, { status: 'SKIPPED', lastError: materialized.reason });
    return;
  }
  if (materialized.kind === 'wait') {
    await finish(churchId, deliveryId, leaseUntil, {
      status: 'PENDING', attempts: 0, nextAttemptAt: retryAt(now, 1), lastError: materialized.reason,
    });
    return;
  }
  if (materialized.kind === 'queued') {
    for (const row of materialized.logs) await enqueue(row.id);
    await finish(churchId, deliveryId, leaseUntil, {
      status: 'PENDING',
      attempts: 0,
      nextAttemptAt: retryAt(now, 1),
      lastError: materialized.shortfall
        ? `${String(materialized.shortfall)} eligible member(s) could not be queued because the church ran out of SMS credits.`
        : null,
    });
    return;
  }

  const waiting = materialized.logs.filter((row) => row.status === 'QUEUED' || row.status === 'SENDING');
  if (waiting.length) {
    for (const row of waiting) {
      if (row.status === 'QUEUED') await enqueue(row.id);
    }
    const current = await withTenant(churchId, null, (tx) => tx.announcementDelivery.findUnique({
      where: { id: deliveryId }, select: { lastError: true },
    }));
    await finish(churchId, deliveryId, leaseUntil, {
      status: 'PENDING',
      attempts: 0,
      nextAttemptAt: retryAt(now, 1),
      lastError: current?.lastError?.includes('could not be queued')
        ? current.lastError
        : `${String(waiting.length)} text message(s) are still queued.`,
    });
    return;
  }

  const sent = materialized.logs.filter((row) => row.status === 'SENT' || row.status === 'DELIVERED').length;
  const failed = materialized.logs.length - sent;
  const fundingShortfall = (await withTenant(churchId, null, (tx) => tx.announcementDelivery.findUnique({
    where: { id: deliveryId }, select: { lastError: true },
  })))?.lastError?.includes('could not be queued') ?? false;
  const partial = sent > 0 && (failed > 0 || fundingShortfall);
  const status = sent === materialized.logs.length && !fundingShortfall ? 'SENT' : partial ? 'PARTIAL' : 'FAILED';
  const reasons: string[] = [];
  if (failed) reasons.push(`${String(failed)} text message(s) could not be sent.`);
  if (fundingShortfall) reasons.push('Some eligible members could not be queued because the church ran out of SMS credits.');
  await finish(churchId, deliveryId, leaseUntil, {
    status,
    sentAt: now,
    lastError: reasons.length ? reasons.join(' ') : null,
  });
}

async function processOne(
  delivery: { id: string; churchId: string; announcementId: string; channel: string },
  now: Date,
  enqueue: EnqueueAnnouncementSms,
): Promise<void> {
  const leaseUntil = new Date(now.getTime() + LEASE_MS);
  const claimed = await prisma.announcementDelivery.updateMany({
    where: {
      id: delivery.id,
      churchId: delivery.churchId,
      OR: [
        {
          status: 'PENDING',
          dueAt: { lte: now },
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
        },
        { status: 'PROCESSING', leaseUntil: { lte: now } },
      ],
    },
    data: { status: 'PROCESSING', leaseUntil, attempts: { increment: 1 } },
  });
  if (claimed.count !== 1) return;

  const current = await withTenant(delivery.churchId, null, async (tx) => {
    const row = await tx.announcementDelivery.findUnique({
      where: { id: delivery.id },
      select: { id: true, churchId: true, announcementId: true, channel: true, attempts: true },
    });
    if (!row) return null;
    const announcement = await tx.announcement.findUnique({
      where: { id: row.announcementId },
      select: {
        id: true,
        title: true,
        body: true,
        publishAt: true,
        expiresAt: true,
        cancelledAt: true,
        moderation: true,
        createdBy: true,
      },
    });
    if (!announcement) return { row, announcement: null };
    const [creator, church] = await Promise.all([
      tx.user.findFirst({
        where: { id: announcement.createdBy, churchId: delivery.churchId },
        select: { isActive: true, roles: { select: { role: { select: { key: true } } } } },
      }),
      tx.church.findUnique({
        where: { id: delivery.churchId },
        select: {
          settings: true,
          billingLocked: true,
          billingExempt: true,
          paidUntil: true,
          trialEndsAt: true,
          graceDays: true,
        },
      }),
    ]);
    return { row, announcement, creator, church };
  });
  if (!current?.announcement) {
    await finish(delivery.churchId, delivery.id, leaseUntil, { status: 'SKIPPED', lastError: 'The announcement no longer exists.' });
    return;
  }

  const { row, announcement, creator, church } = current;
  if (!church) {
    await finish(delivery.churchId, delivery.id, leaseUntil, { status: 'SKIPPED', lastError: 'The church no longer exists.' });
    return;
  }
  const settings = (church.settings ?? {}) as { pushEnabled?: boolean };
  const decision = deliveryDecision({
    now,
    cancelledAt: announcement.cancelledAt,
    moderation: announcement.moderation,
    publishAt: announcement.publishAt,
    expiresAt: announcement.expiresAt,
    creator,
    reachEnabled: effectiveModules(resolveModules(church.settings)).reach,
    billingLocked: billingIsLocked(church, now),
    channel: row.channel,
    pushEnabled: settings.pushEnabled !== false,
    pushConfigured: vapidKeys() !== null,
  });
  if (decision.kind === 'cancel' || decision.kind === 'skip') {
    await finish(delivery.churchId, delivery.id, leaseUntil, { status: decision.kind === 'cancel' ? 'CANCELLED' : 'SKIPPED', lastError: decision.reason });
    return;
  }
  if (decision.kind === 'reschedule') {
    await finish(delivery.churchId, delivery.id, leaseUntil, {
      status: 'PENDING',
      dueAt: decision.dueAt,
      attempts: 0,
      nextAttemptAt: null,
      lastError: null,
    });
    return;
  }

  try {
    if (row.channel === 'INAPP') {
      await deliverInApp(
        delivery.churchId,
        announcement.id,
        announcement.createdBy,
        announcement.title,
        announcement.body,
        announcement.publishAt,
        delivery.id,
        leaseUntil,
        now,
      );
      return;
    }
    if (row.channel === 'SMS') {
      await deliverAnnouncementSms(delivery.churchId, announcement, delivery.id, leaseUntil, now, enqueue);
      return;
    }
    await deliverPush(delivery.churchId, announcement.id, announcement.title, announcement.body, delivery.id, leaseUntil, row.attempts, now);
  } catch (error) {
    await failOrRetry(
      delivery.churchId,
      delivery.id,
      leaseUntil,
      row.attempts,
      now,
      safeDeliveryError(error, row.channel === 'INAPP' ? 'Could not save the in-app notice.' : row.channel === 'SMS' ? 'Could not queue the text messages.' : 'Phone delivery failed.'),
    );
  }
}

export async function processAnnouncementDeliveries(
  now = new Date(),
  enqueue: EnqueueAnnouncementSms = enqueueSmsSend,
): Promise<{ claimed: number; completed: number }> {
  const due = await prisma.announcementDelivery.findMany({
    where: {
      OR: [
        {
          status: 'PENDING',
          dueAt: { lte: now },
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
        },
        { status: 'PROCESSING', leaseUntil: { lte: now } },
      ],
    },
    select: { id: true, churchId: true, announcementId: true, channel: true },
    orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
    take: 100,
  });
  let completed = 0;
  for (const delivery of due) {
    try {
      await processOne(delivery, now, enqueue);
      completed++;
    } catch (error) {
      log.error(`announcement delivery ${delivery.id} failed: ${safeDeliveryError(error, 'Delivery failed.')}`);
    }
  }
  return { claimed: due.length, completed };
}
