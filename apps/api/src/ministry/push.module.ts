// Web push: send a notification to every phone/device subscribed for a church.
// The subscription table has been here since the phase-3 skeleton; this is the
// half that actually delivers once VAPID keys are set. Without keys it is a
// quiet no (configured:false), never an error — the app keeps working.
import { Body, Controller, Delete, Get, Injectable, Module, Post, Req } from '@nestjs/common';
import * as webpush from 'web-push';
import { appendAudit } from '@chms/db';
import { RequirePermissions } from '../common/decorators';
import { AuthedRequest, AuthUser } from '../common/guards';
import { TenantService } from '../common/tenant';

export interface PushPayload {
  title: string;
  body: string;
  /** Where a tap should land, e.g. '/portal' or '/announcements'. */
  url?: string;
  /** Collapses repeat notifications on Android (same tag replaces the old one). */
  tag?: string;
}

interface Vapid {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/** The three env vars that turn push on; all three or none. */
function vapidKeys(): Vapid | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? '';
  const privateKey = process.env.VAPID_PRIVATE_KEY ?? '';
  const subject = process.env.VAPID_SUBJECT ?? '';
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

@Injectable()
export class PushService {
  constructor(private readonly tenant: TenantService) {}

  /** True when the server has VAPID keys, so the app can offer "turn on". */
  configured(): boolean {
    return vapidKeys() !== null;
  }

  /** A staff account subscribes this browser/device. */
  subscribeStaff(user: AuthUser, input: { endpoint: string; p256dh: string; auth: string }) {
    return this.tenant.run(user, async (tx) => {
      await tx.pushSubscription.upsert({
        where: { endpoint: input.endpoint },
        create: {
          churchId: user.churchId,
          userId: user.userId,
          memberId: null,
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
        },
        update: { churchId: user.churchId, userId: user.userId, memberId: null, p256dh: input.p256dh, auth: input.auth },
      });
      return { subscribed: true, vapidConfigured: this.configured() };
    });
  }

  unsubscribeStaff(user: AuthUser, endpoint: string) {
    return this.tenant.run(user, async (tx) => {
      await tx.pushSubscription.deleteMany({ where: { endpoint, churchId: user.churchId } });
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: 'push.unsubscribe', entity: 'PushSubscription', entityId: endpoint });
      return { removed: true };
    });
  }

  /**
   * Send one notification to every device subscribed for this church — staff and
   * portal members alike. The order of the three gates matters:
   *  1. no VAPID keys  → configured:false, nothing sent (honest no, not an error);
   *  2. church switched it off (`settings.pushEnabled === false`) → enabled:false;
   *  3. otherwise send to each; a 404/410 endpoint is dead and is pruned.
   */
  async notifyChurch(
    user: AuthUser,
    payload: PushPayload,
  ): Promise<{ configured: boolean; enabled: boolean; sent: number; pruned: number }> {
    const keys = vapidKeys();
    const { enabled, subs } = await this.tenant.run(user, async (tx) => {
      const church = await tx.church.findUnique({ where: { id: user.churchId }, select: { settings: true } });
      const settings = (church?.settings ?? {}) as { pushEnabled?: boolean };
      const subs = await tx.pushSubscription.findMany({
        where: { churchId: user.churchId },
        select: { id: true, endpoint: true, p256dh: true, auth: true },
      });
      return { enabled: settings.pushEnabled !== false, subs };
    });
    if (!keys) return { configured: false, enabled, sent: 0, pruned: 0 };
    if (!enabled) return { configured: true, enabled: false, sent: 0, pruned: 0 };

    webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
    const body = JSON.stringify(payload);
    const dead: string[] = [];
    let sent = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 3600 });
          sent += 1;
        } catch (err) {
          const code = (err as { statusCode?: number })?.statusCode;
          if (code === 404 || code === 410) dead.push(s.id);
        }
      }),
    );
    if (dead.length) {
      await this.tenant.run(user, (tx) => tx.pushSubscription.deleteMany({ where: { id: { in: dead }, churchId: user.churchId } }));
    }
    return { configured: true, enabled: true, sent, pruned: dead.length };
  }
}

@Controller('push')
export class PushController {
  constructor(private readonly svc: PushService) {}

  // Saving a device token is not editing a member record, but only a signed-in
  // staff account that can read members should add one.
  @RequirePermissions('members:read')
  @Post('subscribe')
  subscribe(@Req() req: AuthedRequest, @Body() dto: { endpoint: string; p256dh: string; auth: string }) {
    return this.svc.subscribeStaff(req.user!, dto);
  }

  @RequirePermissions('members:read')
  @Delete('subscribe')
  unsubscribe(@Req() req: AuthedRequest, @Body('endpoint') endpoint: string) {
    return this.svc.unsubscribeStaff(req.user!, endpoint);
  }

  /** "Send a test to my phone" — lets the owner confirm the keys work. */
  @RequirePermissions('settings:write')
  @Post('test')
  test(@Req() req: AuthedRequest) {
    return this.svc.notifyChurch(req.user!, {
      title: 'ChMS test',
      body: 'Phone notifications are working for this church.',
      url: '/settings',
      tag: 'chms-test',
    });
  }

  /** Whether the server has keys, so the office knows why "turn on" is offered. */
  @RequirePermissions('members:read')
  @Get('status')
  status() {
    return { configured: this.svc.configured() };
  }
}

@Module({
  providers: [TenantService, PushService],
  controllers: [PushController],
  exports: [PushService],
})
export class PushModule {}
