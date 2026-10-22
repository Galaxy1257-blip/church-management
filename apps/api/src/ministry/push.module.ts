// Web push subscriptions (send lands here once VAPID keys are configured —
// BUILD_ORDER phase-3 announcements; the hard part (storage) is done now).
import { Body, Controller, Delete, Injectable, Module, Post, Req } from '@nestjs/common';
import { appendAudit } from '@chms/db';
import { RequirePermissions } from '../common/decorators';
import { AuthedRequest, AuthUser } from '../common/guards';
import { TenantService } from '../common/tenant';

@Injectable()
export class PushService {
  constructor(private readonly tenant: TenantService) {}

  subscribe(user: AuthUser, input: { endpoint: string; p256dh: string; auth: string }) {
    return this.tenant.run(user, async (tx) => {
      await tx.pushSubscription.upsert({
        where: { endpoint: input.endpoint },
        create: { churchId: user.churchId, userId: user.userId, endpoint: input.endpoint, p256dh: input.p256dh, auth: input.auth },
        update: { churchId: user.churchId, userId: user.userId, p256dh: input.p256dh, auth: input.auth },
      });
      return { subscribed: true, vapidConfigured: !!process.env.VAPID_PUBLIC_KEY };
    });
  }

  unsubscribe(user: AuthUser, endpoint: string) {
    return this.tenant.run(user, async (tx) => {
      await tx.pushSubscription.deleteMany({ where: { endpoint, churchId: user.churchId } });
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: 'push.unsubscribe', entity: 'PushSubscription', entityId: endpoint });
      return { removed: true };
    });
  }
}

@Controller('push')
export class PushController {
  constructor(private readonly svc: PushService) {}

  @RequirePermissions('members:read')
  @Post('subscribe')
  subscribe(@Req() req: AuthedRequest, @Body() dto: { endpoint: string; p256dh: string; auth: string }) {
    return this.svc.subscribe(req.user!, dto);
  }

  @RequirePermissions('members:read')
  @Delete('subscribe')
  unsubscribe(@Req() req: AuthedRequest, @Body('endpoint') endpoint: string) {
    return this.svc.unsubscribe(req.user!, endpoint);
  }
}

@Module({
  providers: [TenantService, PushService],
  controllers: [PushController],
})
export class PushModule {}
