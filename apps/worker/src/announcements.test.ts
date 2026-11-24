import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { platformPrisma, withTenant } from '@chms/db';
import { sendNotification } from 'web-push';
import {
  billingIsLocked,
  deliveryDecision,
  processAnnouncementDeliveries,
  retryAt,
  safeDeliveryError,
  type DeliveryContext,
} from './announcements';

vi.mock('@chms/db', () => ({
  platformPrisma: { announcementDelivery: { findMany: vi.fn(), updateMany: vi.fn() } },
  withTenant: vi.fn(),
}));
vi.mock('web-push', () => ({ sendNotification: vi.fn() }));

const now = new Date('2026-11-24T10:00:00.000Z');
const due = { id: 'd1', churchId: 'c1', announcementId: 'a1', channel: 'INAPP' };

function context(overrides: Partial<DeliveryContext> = {}): DeliveryContext {
  return {
    now,
    cancelledAt: null,
    moderation: 'APPROVED',
    publishAt: new Date('2026-11-24T09:00:00.000Z'),
    expiresAt: null,
    creator: { isActive: true, roles: [{ role: { key: 'PASTOR' } }] },
    reachEnabled: true,
    billingLocked: false,
    channel: 'INAPP',
    pushEnabled: true,
    pushConfigured: true,
    ...overrides,
  };
}

function setup(overrides: {
  announcement?: Record<string, unknown>;
  creator?: Record<string, unknown> | null;
  church?: Record<string, unknown>;
  subscriptions?: Record<string, unknown>[];
  members?: Record<string, unknown>[];
  optOuts?: Record<string, unknown>[];
  smsLogs?: Record<string, unknown>[];
  smsBalance?: number;
  quietHours?: { enabled: boolean; start: number; end: number };
  deliveryError?: string | null;
  claimCount?: number;
  channel?: string;
} = {}) {
  const currentDue = { ...due, channel: overrides.channel ?? due.channel };
  const smsRows: Record<string, unknown>[] = [...(overrides.smsLogs ?? [])];
  let smsBalance = overrides.smsBalance ?? 10;
  const deliveryRow: Record<string, unknown> = { ...currentDue, attempts: 1, lastError: overrides.deliveryError ?? null };
  const announcement = {
    id: 'a1',
    title: 'Sunday service',
    body: 'We begin at nine.',
    publishAt: new Date('2026-11-24T09:00:00.000Z'),
    expiresAt: null,
    cancelledAt: null,
    moderation: 'APPROVED',
    createdBy: 'u1',
    ...overrides.announcement,
  };
  const tx = {
    announcementDelivery: {
      findUnique: vi.fn(async () => deliveryRow),
      updateMany: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(deliveryRow, data);
        return { count: 1 };
      }),
    },
    announcement: { findUnique: vi.fn(async () => announcement) },
    user: {
      findFirst: vi.fn(async () => overrides.creator === undefined
        ? { isActive: true, roles: [{ role: { key: 'PASTOR' } }] }
        : overrides.creator),
    },
    member: {
      findMany: vi.fn(async () => overrides.members ?? []),
    },
    smsOptOut: {
      findMany: vi.fn(async () => overrides.optOuts ?? []),
    },
    smsWallet: {
      findUnique: vi.fn(async () => ({ churchId: 'c1', balanceUnits: smsBalance, reservedUnits: 0 })),
      updateMany: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const decrement = (data.balanceUnits as { decrement?: number } | undefined)?.decrement ?? 0;
        if (decrement > smsBalance) return { count: 0 };
        smsBalance -= decrement;
        return { count: 1 };
      }),
    },
    smsLog: {
      findMany: vi.fn(async ({ where }: { where?: { idempotencyKey?: { startsWith?: string } } } = {}) => {
        const prefix = where?.idempotencyKey?.startsWith;
        return prefix ? smsRows.filter((row) => String(row.idempotencyKey).startsWith(prefix)) : smsRows;
      }),
      createMany: vi.fn(async ({ data }: { data: Record<string, unknown>[] }) => {
        for (const [index, row] of data.entries()) smsRows.push({ id: `sms-${String(index + 1)}`, ...row });
        return { count: data.length };
      }),
    },
    smsLedger: { createMany: vi.fn(async () => ({ count: 0 })) },
    church: {
      findUnique: vi.fn(async () => ({
        settings: overrides.quietHours ? { smsQuietHours: overrides.quietHours } : {},
        timezone: 'Africa/Accra',
        billingLocked: false,
        billingExempt: false,
        paidUntil: null,
        trialEndsAt: null,
        graceDays: 7,
        ...overrides.church,
      })),
    },
    notification: { upsert: vi.fn(async () => ({})) },
    pushSubscription: {
      findMany: vi.fn(async () => overrides.subscriptions ?? []),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  };
  vi.mocked(platformPrisma.announcementDelivery.findMany).mockResolvedValue([currentDue] as never);
  vi.mocked(platformPrisma.announcementDelivery.updateMany).mockResolvedValue({ count: overrides.claimCount ?? 1 } as never);
  vi.mocked(withTenant).mockImplementation(async (_churchId, _userId, fn) => fn(tx as never));
  return { tx, announcement, smsRows, deliveryRow };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VAPID_SUBJECT', 'mailto:push@example.com');
  vi.stubEnv('VAPID_PUBLIC_KEY', 'public-key');
  vi.stubEnv('VAPID_PRIVATE_KEY', 'private-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('due-time delivery rules', () => {
  it('does not send a cancelled, unapproved or expired announcement', () => {
    expect(deliveryDecision(context({ cancelledAt: now })).kind).toBe('cancel');
    expect(deliveryDecision(context({ moderation: 'PENDING' })).kind).toBe('skip');
    expect(deliveryDecision(context({ expiresAt: now })).kind).toBe('skip');
  });

  it('moves a stale delivery back to the current publishing time', () => {
    const publishAt = new Date('2026-11-25T10:00:00.000Z');
    expect(deliveryDecision(context({ publishAt }))).toEqual({ kind: 'reschedule', dueAt: publishAt });
  });

  it('rechecks the sender, News switch and billing at sending time', () => {
    expect(deliveryDecision(context({ creator: null })).kind).toBe('skip');
    expect(deliveryDecision(context({ creator: { isActive: true, roles: [{ role: { key: 'MEMBER' } }] } })).kind).toBe('skip');
    expect(deliveryDecision(context({ reachEnabled: false })).kind).toBe('skip');
    expect(deliveryDecision(context({ billingLocked: true })).kind).toBe('skip');
  });

  it('does not claim push delivery when it is off or unconfigured', () => {
    expect(deliveryDecision(context({ channel: 'PUSH', pushEnabled: false })).kind).toBe('skip');
    expect(deliveryDecision(context({ channel: 'PUSH', pushConfigured: false })).kind).toBe('skip');
  });

  it('allows SMS without requiring push configuration', () => {
    expect(deliveryDecision(context({ channel: 'SMS', pushEnabled: false, pushConfigured: false }))).toEqual({ kind: 'send' });
  });

  it('matches the API grace boundary and support-lock precedence', () => {
    const church = {
      billingLocked: false,
      billingExempt: false,
      paidUntil: new Date('2026-11-20T10:00:00.000Z'),
      trialEndsAt: null,
      graceDays: 7,
    };
    expect(billingIsLocked(church, new Date('2026-11-27T09:59:59.000Z'))).toBe(false);
    expect(billingIsLocked(church, new Date('2026-11-27T10:00:00.000Z'))).toBe(true);
    expect(billingIsLocked({ ...church, billingExempt: true }, now)).toBe(false);
    expect(billingIsLocked({ ...church, billingLocked: true, billingExempt: true }, now)).toBe(true);
  });

  it('backs off retries and never stores endpoint-bearing errors', () => {
    expect(retryAt(now, 1)).toEqual(new Date('2026-11-24T10:01:00.000Z'));
    expect(retryAt(now, 2)).toEqual(new Date('2026-11-24T10:02:00.000Z'));
    expect(retryAt(now, 3)).toEqual(new Date('2026-11-24T10:04:00.000Z'));
    expect(safeDeliveryError(new Error('failed at https://private.example/device-secret'), 'Push failed.')).toBe('Push failed.');
    expect(safeDeliveryError({ statusCode: 503 }, 'Push failed.')).toBe('The push service returned 503.');
  });
});

describe('delivery outbox processing', () => {
  it('claims atomically and inserts the in-app notification under a stable dedupe key', async () => {
    const { tx } = setup();
    await expect(processAnnouncementDeliveries(now)).resolves.toEqual({ claimed: 1, completed: 1 });
    expect(platformPrisma.announcementDelivery.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'd1', churchId: 'c1' }),
      data: expect.objectContaining({ status: 'PROCESSING', attempts: { increment: 1 } }),
    }));
    expect(tx.notification.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { churchId_dedupeKey: { churchId: 'c1', dedupeKey: 'announcement:a1:inapp' } },
      create: expect.objectContaining({ kind: 'ANNOUNCEMENT', sourceId: 'a1', sentAt: now }),
      update: {},
    }));
    expect(tx.announcementDelivery.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'SENT', sentAt: now }),
    }));
  });

  it('does nothing when another worker wins the claim', async () => {
    setup({ claimCount: 0 });
    await processAnnouncementDeliveries(now);
    expect(withTenant).not.toHaveBeenCalled();
  });

  it('cancels instead of sending when cancellation won the race', async () => {
    const { tx } = setup({ announcement: { cancelledAt: now } });
    await processAnnouncementDeliveries(now);
    expect(tx.notification.upsert).not.toHaveBeenCalled();
    expect(tx.announcementDelivery.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'CANCELLED' }),
    }));
  });

  it('returns a rescheduled announcement to pending without consuming an attempt', async () => {
    const publishAt = new Date('2026-11-25T10:00:00.000Z');
    const { tx } = setup({ announcement: { publishAt } });
    await processAnnouncementDeliveries(now);
    expect(tx.announcementDelivery.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PENDING', dueAt: publishAt, attempts: 0 }),
    }));
  });

  it('records a partial push without replaying the whole batch', async () => {
    const subscriptions = [
      { id: 's1', endpoint: 'https://push.example/one', p256dh: 'one', auth: 'a' },
      { id: 's2', endpoint: 'https://push.example/two', p256dh: 'two', auth: 'b' },
    ];
    const { tx } = setup({
      announcement: { id: 'a1' },
      subscriptions,
      channel: 'PUSH',
    });
    vi.mocked(sendNotification)
      .mockResolvedValueOnce({ statusCode: 201 } as never)
      .mockRejectedValueOnce(Object.assign(new Error('endpoint secret'), { statusCode: 503 }));
    await processAnnouncementDeliveries(now);
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(tx.announcementDelivery.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PARTIAL', sentAt: now, lastError: '1 phone(s) could not be reached.' }),
    }));
  });

  it('retries a zero-success push failure with backoff', async () => {
    const { tx } = setup({
      subscriptions: [{ id: 's1', endpoint: 'https://push.example/one', p256dh: 'one', auth: 'a' }],
      channel: 'PUSH',
    });
    vi.mocked(sendNotification).mockRejectedValue(Object.assign(new Error('private endpoint'), { statusCode: 503 }));
    await processAnnouncementDeliveries(now);
    expect(tx.announcementDelivery.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'PENDING',
        nextAttemptAt: new Date('2026-11-24T10:01:00.000Z'),
        lastError: 'The push service returned 503.',
      }),
    }));
  });

  it('prunes dead devices and reports an honest skip when none are active', async () => {
    const { tx } = setup({
      subscriptions: [{ id: 's1', endpoint: 'https://push.example/gone', p256dh: 'one', auth: 'a' }],
      channel: 'PUSH',
    });
    vi.mocked(sendNotification).mockRejectedValue(Object.assign(new Error('gone'), { statusCode: 410 }));
    await processAnnouncementDeliveries(now);
    expect(tx.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['s1'] }, churchId: 'c1' } });
    expect(tx.announcementDelivery.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'SKIPPED', lastError: 'No subscribed phones are still active.' }),
    }));
  });
});

describe('announcement SMS delivery', () => {
  it('fans out once to unique consented numbers, excluding opt-outs, and reserves credits', async () => {
    const { tx, smsRows } = setup({
      channel: 'SMS',
      members: [
        { phoneE164: '+233241234567' },
        { phoneE164: '0241234567' },
        { phoneE164: '+233249999999' },
        { phoneE164: 'not-a-phone' },
      ],
      optOuts: [{ phoneE164: '+233249999999' }],
      smsBalance: 10,
    });
    const enqueue = vi.fn();
    await processAnnouncementDeliveries(now, enqueue);
    expect(tx.member.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'ACTIVE', smsConsent: true, deletedAt: null }),
    }));
    expect(smsRows).toHaveLength(1);
    expect(smsRows.map((row) => row.toE164)).toEqual(['+233241234567']);
    expect(smsRows[0]).toMatchObject({
      source: 'ANNOUNCEMENT',
      body: 'Sunday service: We begin at nine.',
      status: 'QUEUED',
      idempotencyKey: 'announcement:a1:sms:+233241234567',
    });
    expect(tx.smsWallet.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { balanceUnits: { decrement: 1 }, reservedUnits: { increment: 1 } },
    }));
    expect(tx.smsLedger.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ delta: -1, reason: 'RESERVE', refType: 'SMS_LOG' })],
    }));
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(tx.announcementDelivery.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PENDING', attempts: 0 }),
    }));
  });

  it('records the wallet balance after the atomic reservation, including a competing reservation', async () => {
    const { tx } = setup({ channel: 'SMS', members: [{ phoneE164: '+233241234567' }], smsBalance: 10 });
    tx.smsWallet.findUnique
      .mockResolvedValueOnce({ churchId: 'c1', balanceUnits: 10, reservedUnits: 0 })
      .mockResolvedValueOnce({ churchId: 'c1', balanceUnits: 6, reservedUnits: 1 });
    await processAnnouncementDeliveries(now, vi.fn());
    expect(tx.smsLedger.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ delta: -1, balanceAfter: 6 })],
    }));
  });

  it('waits through quiet hours without reserving credits or queueing texts', async () => {
    const { tx, smsRows } = setup({
      channel: 'SMS',
      members: [{ phoneE164: '+233241234567' }],
      quietHours: { enabled: true, start: 9, end: 11 },
    });
    const enqueue = vi.fn();
    await processAnnouncementDeliveries(now, enqueue);
    expect(smsRows).toHaveLength(0);
    expect(tx.smsWallet.updateMany).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    expect(tx.announcementDelivery.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PENDING', attempts: 0, lastError: expect.stringContaining('quiet hours') }),
    }));
  });

  it('reports a skip when no consented members are eligible', async () => {
    const { tx } = setup({ channel: 'SMS' });
    await processAnnouncementDeliveries(now, vi.fn());
    expect(tx.announcementDelivery.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'SKIPPED', lastError: expect.stringContaining('No active members') }),
    }));
  });

  it('marks SMS sent only after every queued text reaches a terminal success state', async () => {
    const { tx } = setup({
      channel: 'SMS',
      smsLogs: [{ id: 'sms-1', status: 'DELIVERED', idempotencyKey: 'announcement:a1:sms:+233241234567' }],
    });
    await processAnnouncementDeliveries(now, vi.fn());
    expect(tx.announcementDelivery.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'SENT', sentAt: now, lastError: null }),
    }));
  });

  it('keeps partial funding visible after the affordable texts are sent', async () => {
    const { tx, smsRows } = setup({
      channel: 'SMS',
      members: [{ phoneE164: '+233241234567' }, { phoneE164: '+233249999999' }],
      smsBalance: 1,
    });
    await processAnnouncementDeliveries(now, vi.fn());
    expect(smsRows).toHaveLength(1);
    expect(tx.announcementDelivery.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ lastError: expect.stringContaining('ran out of SMS credits') }),
    }));
    smsRows[0].status = 'SENT';
    await processAnnouncementDeliveries(new Date(now.getTime() + 60_000), vi.fn());
    expect(tx.announcementDelivery.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PARTIAL', lastError: expect.stringContaining('ran out of SMS credits') }),
    }));
  });

  it('marks the delivery failed when every text fails', async () => {
    const { tx } = setup({
      channel: 'SMS',
      smsLogs: [{ id: 'sms-1', status: 'FAILED', idempotencyKey: 'announcement:a1:sms:+233241234567' }],
    });
    await processAnnouncementDeliveries(now, vi.fn());
    expect(tx.announcementDelivery.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'FAILED', lastError: '1 text message(s) could not be sent.' }),
    }));
  });
});
