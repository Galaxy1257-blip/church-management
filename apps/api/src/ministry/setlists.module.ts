// Setlists (worship companion): ordered song ids per service, stored in
// Church.settings.setlists; projection "now playing" reads the active one.
import { Body, Controller, Get, Injectable, Module, Post, Req } from '@nestjs/common';
import { IsArray, IsString, MinLength } from 'class-validator';
import { appendAudit } from '@chms/db';
import { RequirePermissions } from '../common/decorators';
import { AuthedRequest, AuthUser } from '../common/guards';
import { TenantService } from '../common/tenant';

class SetlistDto {
  @IsString() @MinLength(1) name!: string;
  @IsString() serviceId?: string;
  @IsArray() songIds!: string[];
}

@Injectable()
export class SetlistsService {
  constructor(private readonly tenant: TenantService) {}

  async list(user: AuthUser) {
    const church = await this.tenant.run(user, (tx) => tx.church.findUniqueOrThrow({ where: { id: user.churchId } }));
    return ((church.settings as any)?.setlists ?? []) as any[];
  }

  async add(user: AuthUser, input: SetlistDto, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const church = await tx.church.findUniqueOrThrow({ where: { id: user.churchId } });
      const lists = ((church.settings as any)?.setlists ?? []) as any[];
      const setlist = { id: `sl_${Date.now()}`, ...input, createdAt: new Date().toISOString() };
      await tx.church.update({
        where: { id: user.churchId },
        data: { settings: { ...(church.settings as any), setlists: [...lists, setlist] } as any },
      });
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: 'media.setlist.add', entity: 'Setlist', entityId: setlist.id, ip });
      return setlist;
    });
  }
}

@Controller('setlists')
export class SetlistsController {
  constructor(private readonly svc: SetlistsService) {}

  @RequirePermissions('media:read')
  @Get()
  list(@Req() req: AuthedRequest) {
    return this.svc.list(req.user!);
  }

  @RequirePermissions('media:write')
  @Post()
  add(@Req() req: AuthedRequest, @Body() dto: SetlistDto) {
    return this.svc.add(req.user!, dto, req.ip);
  }
}

@Module({
  providers: [TenantService, SetlistsService],
  controllers: [SetlistsController],
})
export class SetlistsModule {}
