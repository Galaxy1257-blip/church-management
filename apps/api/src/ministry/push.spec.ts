// Web push: the send path must be a quiet no without VAPID keys, must obey the
// church's own phone-notification switch, and must prune devices the push service
// says are gone (404/410) so the list cannot grow forever. web-push itself is
// mocked — these tests decide behaviour, not the network.
import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSIONS_KEY } from '../common/decorators';
import { PushController, PushService } from './push.module';

vi.mock('web-push', () => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
}));
import * as webpush from 'web-push';

const USER = { churchId: 'c1', userId: 'u1' } as never;

function fakeTenant(opts: { settings?: Record<string, unknown>; subs?: Array<Record<string, string>> }) {
  const deleted: any[] = [];
  const tx = {
    church: { findUnique: async () => ({ settings: opts.settings ?? {} }) },
    pushSubscription: {
      findMany: async () => opts.subs ?? [],
      deleteMany: async (args: any) => {
        deleted.push(args);
        return { count: args?.where?.id?.in?.length ?? 0 };
      },
    },
  };
  const tenant = { run: async (_u: unknown, fn: (t: typeof tx) => unknown) => fn(tx) } as never;
  return { tenant, deleted };
}

function withKeys(): void {
  process.env.VAPID_PUBLIC_KEY = 'pub';
  process.env.VAPID_PRIVATE_KEY = 'priv';
  process.env.VAPID_SUBJECT = 'mailto:noreply@example.org';
}
function withoutKeys(): void {
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_SUBJECT;
}

describe('PushService.notifyChurch', () => {
  const saved = { ...process.env };
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    process.env = { ...saved };
  });

  it('is a quiet no when the server has no VAPID keys', async () => {
    withoutKeys();
    const { tenant } = fakeTenant({ settings: {}, subs: [{ id: 's1', endpoint: 'e', p256dh: 'p', auth: 'a' }] });
    const result = await new PushService(tenant).notifyChurch(USER, { title: 't', body: 'b' });
    expect(result).toEqual({ configured: false, enabled: true, sent: 0, pruned: 0 });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it('does nothing when the church switched phone notifications off', async () => {
    withKeys();
    const { tenant } = fakeTenant({ settings: { pushEnabled: false }, subs: [{ id: 's1', endpoint: 'e', p256dh: 'p', auth: 'a' }] });
    const result = await new PushService(tenant).notifyChurch(USER, { title: 't', body: 'b' });
    expect(result.configured).toBe(true);
    expect(result.enabled).toBe(false);
    expect(result.sent).toBe(0);
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it('sends to each subscribed device', async () => {
    withKeys();
    const subs = [
      { id: 'a', endpoint: 'one', p256dh: 'p', auth: 'a' },
      { id: 'b', endpoint: 'two', p256dh: 'p', auth: 'a' },
    ];
    const { tenant } = fakeTenant({ settings: {}, subs });
    const result = await new PushService(tenant).notifyChurch(USER, { title: 'Hi', body: 'There' });
    expect(result).toEqual({ configured: true, enabled: true, sent: 2, pruned: 0 });
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
  });

  it('prunes a device the push service says is gone (410)', async () => {
    withKeys();
    const subs = [
      { id: 'ok', endpoint: 'good', p256dh: 'p', auth: 'a' },
      { id: 'dead', endpoint: 'gone', p256dh: 'p', auth: 'a' },
    ];
    (webpush.sendNotification as any).mockImplementation(async (sub: { endpoint: string }) => {
      if (sub.endpoint === 'gone') {
        const err: any = new Error('gone');
        err.statusCode = 410;
        throw err;
      }
      return {};
    });
    const { tenant, deleted } = fakeTenant({ settings: {}, subs });
    const result = await new PushService(tenant).notifyChurch(USER, { title: 't', body: 'b' });
    expect(result).toEqual({ configured: true, enabled: true, sent: 1, pruned: 1 });
    expect(deleted[0].where.id.in).toEqual(['dead']);
  });
});

function required(handler: unknown): unknown {
  return Reflect.getMetadata(PERMISSIONS_KEY, handler as object);
}

describe('the push routes', () => {
  it('lets a member-reader subscribe and only settings-writers send a test', () => {
    expect(required(PushController.prototype.subscribe)).toEqual(['members:read']);
    expect(required(PushController.prototype.unsubscribe)).toEqual(['members:read']);
    expect(required(PushController.prototype.status)).toEqual(['members:read']);
    expect(required(PushController.prototype.test)).toEqual(['settings:write']);
  });
});
