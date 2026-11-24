import 'reflect-metadata';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../common/guards';
import { AnnouncementsService } from './announcements.module';

vi.mock('@chms/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@chms/db')>();
  return { ...actual, appendAudit: vi.fn(async () => undefined) };
});

const user = { userId: 'u1', churchId: 'c1', roles: ['PASTOR'], permissions: ['campaigns:write'] } as AuthUser;
const now = new Date('2026-11-24T10:00:00.000Z');

afterEach(() => {
  vi.useRealTimers();
});

function fakeTenant(announcement?: Record<string, unknown>, activeLease = false) {
  const created: Record<string, unknown>[] = [];
  const deliveryRows: Record<string, unknown>[] = [];
  const tx = {
    $queryRaw: vi.fn(async () => [{ id: 'a1' }]),
    $executeRaw: vi.fn(async () => 1),
    member: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
    announcement: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'a1', ...data })),
      findFirst: vi.fn(async () => announcement ?? null),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'a1', ...announcement, ...data })),
    },
    announcementDelivery: {
      createMany: vi.fn(async ({ data }: { data: Record<string, unknown>[] }) => {
        created.push(...data);
        return { count: data.length };
      }),
      findMany: vi.fn(async () => deliveryRows),
      findFirst: vi.fn(async () => (activeLease ? { id: 'd1' } : null)),
      updateMany: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        for (const row of deliveryRows) Object.assign(row, data);
        return { count: deliveryRows.length };
      }),
    },
    notification: { createMany: vi.fn(async () => ({ count: 0 })) },
  };
  return {
    tx,
    created,
    deliveryRows,
    tenant: { run: (_u: AuthUser, fn: (t: unknown) => Promise<unknown>) => fn(tx) } as never,
  };
}

describe('scheduled announcements', () => {
  it('creates one due delivery per selected channel', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const fake = fakeTenant();
    const publishAt = new Date('2026-11-25T15:30:00.000Z');
    const result = await new AnnouncementsService(fake.tenant).create(user, {
      title: 'Sunday service',
      body: 'We begin at nine.',
      channels: ['INAPP', 'PUSH'],
      publishAt: publishAt.toISOString(),
    });
    expect(result.publishAt).toEqual(publishAt);
    expect(fake.created).toEqual([
      { churchId: 'c1', announcementId: 'a1', channel: 'INAPP', status: 'PENDING', dueAt: publishAt },
      { churchId: 'c1', announcementId: 'a1', channel: 'PUSH', status: 'PENDING', dueAt: publishAt },
    ]);
  });

  it('creates a durable SMS delivery alongside the selected channels', async () => {
    const fake = fakeTenant();
    const result = await new AnnouncementsService(fake.tenant).create(user, {
      title: 'Sunday service',
      body: 'We begin at nine.',
      channels: ['INAPP', 'SMS'],
    });
    expect(result.channels).toEqual(['INAPP', 'SMS']);
    expect(fake.created).toEqual([
      { churchId: 'c1', announcementId: 'a1', channel: 'INAPP', status: 'PENDING', dueAt: expect.any(Date) },
      { churchId: 'c1', announcementId: 'a1', channel: 'SMS', status: 'PENDING', dueAt: expect.any(Date) },
    ]);
  });

  it('rejects an SMS announcement that exceeds the paid segment limit', async () => {
    const fake = fakeTenant();
    await expect(new AnnouncementsService(fake.tenant).create(user, {
      title: 'Sunday service',
      body: 'Long message. '.repeat(200),
      channels: ['SMS'],
    })).rejects.toThrow(/10 text segments/);
    expect(fake.tx.announcement.create).not.toHaveBeenCalled();
  });

  it('rejects an expiry at or before the publishing time', async () => {
    const fake = fakeTenant();
    await expect(new AnnouncementsService(fake.tenant).create(user, {
      title: 'Sunday service',
      body: 'We begin at nine.',
      publishAt: '2026-11-25T10:00:00.000Z',
      expiresAt: '2026-11-25T10:00:00.000Z',
    })).rejects.toThrow(/expiry must be after/);
  });

  it('approval assigns the deciding leader and creates the delivery rows', async () => {
    const fake = fakeTenant({ id: 'a1', channels: ['INAPP'], publishAt: now, moderation: 'PENDING', cancelledAt: null });
    const result = await new AnnouncementsService(fake.tenant).moderate(user, 'a1', true);
    expect(fake.tx.announcement.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { moderation: 'APPROVED', createdBy: 'u1' },
    });
    expect(fake.created[0]).toMatchObject({ announcementId: 'a1', channel: 'INAPP', dueAt: now });
    expect(result.moderation).toBe('APPROVED');
  });

  it('will not cancel or reschedule once delivery holds a lease', async () => {
    const future = new Date('2026-12-01T10:00:00.000Z');
    const fake = fakeTenant({ id: 'a1', publishAt: future, expiresAt: null, moderation: 'APPROVED', cancelledAt: null }, true);
    const svc = new AnnouncementsService(fake.tenant);
    await expect(svc.cancel(user, 'a1')).rejects.toThrow(/already started/);
    await expect(svc.reschedule(user, 'a1', { publishAt: '2026-12-02T10:00:00.000Z' })).rejects.toThrow(/already started/);
    expect(fake.tx.announcement.update).not.toHaveBeenCalled();
  });

  it('moves pending deliveries with the announcement when rescheduled', async () => {
    const future = new Date('2026-12-01T10:00:00.000Z');
    const next = new Date('2026-12-02T10:00:00.000Z');
    const fake = fakeTenant({ id: 'a1', publishAt: future, expiresAt: null, moderation: 'APPROVED', cancelledAt: null });
    fake.deliveryRows.push({ id: 'd1', status: 'PENDING' });
    const result = await new AnnouncementsService(fake.tenant).reschedule(user, 'a1', { publishAt: next.toISOString() });
    expect(result.publishAt).toEqual(next);
    expect(fake.tx.announcementDelivery.updateMany).toHaveBeenCalledWith({
      where: { announcementId: 'a1', status: 'PENDING' },
      data: { dueAt: next, nextAttemptAt: null, lastError: null, leaseUntil: null },
    });
  });
});
