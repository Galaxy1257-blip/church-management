// WhatsApp channel skeleton: template registry only. Provider approval and
// pricing are *verify-before-build* (BUILD_ORDER Phase 3) — sending is not
// wired until the church's WhatsApp Business provider is confirmed.
import { Body, Controller, Get, Injectable, Module, Post, Req } from '@nestjs/common';

import { RequirePermissions } from '../common/decorators';
import { AuthedRequest, AuthUser } from '../common/guards';
import { TenantService } from '../common/tenant';

@Injectable()
export class WhatsAppService {
  constructor(private readonly tenant: TenantService) {}

  templates(user: AuthUser) {
    return this.tenant.run(user, (tx) => tx.whatsAppTemplate.findMany({ where: { churchId: user.churchId } }));
  }

  register(user: AuthUser, input: { name: string; providerTemplateId: string; bodyPreview: string }) {
    return this.tenant.run(user, (tx) =>
      tx.whatsAppTemplate.upsert({
        where: { churchId_name: { churchId: user.churchId, name: input.name } },
        create: { churchId: user.churchId, ...input, status: 'PENDING' },
        update: { providerTemplateId: input.providerTemplateId, bodyPreview: input.bodyPreview },
      }),
    );
  }
}


@Controller('whatsapp')
export class WhatsAppController {
  constructor(private readonly svc: WhatsAppService) {}

  @RequirePermissions('sms:read')
  @Get('templates')
  templates(@Req() req: AuthedRequest) {
    return this.svc.templates(req.user!);
  }

  @RequirePermissions('sms:send')
  @Post('templates')
  register(@Req() req: AuthedRequest, @Body() dto: { name: string; providerTemplateId: string; bodyPreview: string }) {
    return this.svc.register(req.user!, { ...dto, name: dto.name?.trim?.() ?? '' });
  }
}

@Module({
  providers: [TenantService, WhatsAppService],
  controllers: [WhatsAppController],
})
export class WhatsAppModule {}
