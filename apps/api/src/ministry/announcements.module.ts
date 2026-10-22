// Announcements: in-app content with channel hints (SMS dispatch goes via
// campaigns; PUSH lands in phase-3; in-app reads via list below).
import { Body, Controller, Get, Injectable, Module, Post, Query, Req } from '@nestjs/common';
import { IsArray, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { appendAudit } from '@chms/db';
import { RequirePermissions } from '../common/decorators';
import { AuthedRequest, AuthUser } from '../common/guards';
import { TenantService } from '../common/tenant';

class AnnouncementDto {
  @IsString() @MinLength(1) title!: string;
  @IsString() @MinLength(1) body!: string;
  // R4.6: funeral/one-week/outdooring quick-path categories
  @IsOptional() @IsIn(['GENERAL', 'FUNERAL', 'OUTDOORING', 'EVENT', 'ALERT']) category?: string;
  @IsOptional() @IsArray() channels?: string[];
  @IsOptional() @IsString() expiresAt?: string;
}

@Injectable()
export class AnnouncementsService {
  constructor(private readonly tenant: TenantService) {}

  list(user: AuthUser, category?: string) {
    return this.tenant.run(user, (tx) =>
      tx.announcement.findMany({
        where: {
          churchId: user.churchId,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          ...(category && category !== 'ALL' ? { category } : {}),
        },
        orderBy: { publishAt: 'desc' },
        take: 100,
      }),
    );
  }

  create(user: AuthUser, input: AnnouncementDto, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const a = await tx.announcement.create({
        data: {
          churchId: user.churchId,
          title: input.title,
          body: input.body,
          category: input.category ?? 'GENERAL',
          channels: input.channels ?? ['INAPP'],
          audience: {} as any,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          createdBy: user.userId,
        },
      });
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: 'announcement.create', entity: 'Announcement', entityId: a.id, ip });
      return a;
    });
  }
}

@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly svc: AnnouncementsService) {}

  @RequirePermissions('services:read')
  @Get()
  list(@Req() req: AuthedRequest, @Query('category') category?: string) {
    return this.svc.list(req.user!, category);
  }

  @RequirePermissions('campaigns:write')
  @Post()
  create(@Req() req: AuthedRequest, @Body() dto: AnnouncementDto) {
    return this.svc.create(req.user!, dto, req.ip);
  }
}

@Module({
  providers: [TenantService, AnnouncementsService],
  controllers: [AnnouncementsController],
})
export class AnnouncementsModule {}
