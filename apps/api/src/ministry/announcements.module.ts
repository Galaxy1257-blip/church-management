// Announcements: in-app content with channel hints (SMS dispatch goes via
// campaigns; PUSH lands in phase-3; in-app reads via list below).
import { Body, Controller, Get, Injectable, Module, NotFoundException, Param, Post, Query, Req } from '@nestjs/common';
import { IsArray, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { appendAudit } from '@chms/db';
import { RequirePermissions } from '../common/decorators';
import { normalizePhotoDataUrl } from '../common/photo';
import { AuthedRequest, AuthUser } from '../common/guards';
import { TenantService } from '../common/tenant';

class AnnouncementDto {
  @IsString() @MinLength(1) title!: string;
  @IsString() @MinLength(1) body!: string;
  // R4.6: funeral/one-week/outdooring quick-path categories
  @IsOptional() @IsIn(['GENERAL', 'FUNERAL', 'OUTDOORING', 'EVENT', 'ALERT']) category?: string;
  @IsOptional() @IsArray() channels?: string[];
  @IsOptional() @IsString() expiresAt?: string;
  /** The member this notice is about (funeral/outdooring) — opens their profile. */
  @IsOptional() @IsString() memberId?: string;
  /** Photo published with the notice, e.g. the deceased (data URL). */
  @IsOptional() @IsString() photoDataUrl?: string;
}

const MEMBER_SUMMARY = {
  id: true,
  firstName: true,
  lastName: true,
  phoneE164: true,
  address: true,
  status: true,
  photoDataUrl: true,
} as const;

@Injectable()
export class AnnouncementsService {
  constructor(private readonly tenant: TenantService) {}

  list(user: AuthUser, category?: string) {
    return this.tenant.run(user, async (tx) => {
      const rows = await tx.announcement.findMany({
        where: {
          churchId: user.churchId,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          ...(category && category !== 'ALL' ? { category } : {}),
        },
        orderBy: { publishAt: 'desc' },
        take: 100,
        // Photos can be ~200 KB each; the list stays light and the detail
        // endpoint returns the published picture.
        select: {
          id: true,
          title: true,
          body: true,
          category: true,
          channels: true,
          publishAt: true,
          expiresAt: true,
          memberId: true,
          createdBy: true,
        },
      });
      const memberIds = [...new Set(rows.map((r) => r.memberId).filter((v): v is string => Boolean(v)))];
      const members = memberIds.length
        ? await tx.member.findMany({
            where: { churchId: user.churchId, id: { in: memberIds } },
            select: MEMBER_SUMMARY,
          })
        : [];
      const byId = new Map(members.map((m) => [m.id, m]));
      return rows.map((r) => ({ ...r, member: r.memberId ? byId.get(r.memberId) ?? null : null }));
    });
  }

  getOne(user: AuthUser, id: string) {
    return this.tenant.run(user, async (tx) => {
      const a = await tx.announcement.findFirst({ where: { id, churchId: user.churchId } });
      if (!a) throw new NotFoundException('announcement not found');
      const member = a.memberId
        ? await tx.member.findFirst({
            where: { churchId: user.churchId, id: a.memberId },
            select: MEMBER_SUMMARY,
          })
        : null;
      return { ...a, member };
    });
  }

  create(user: AuthUser, input: AnnouncementDto, ip?: string) {
    const photo = normalizePhotoDataUrl(input.photoDataUrl);
    return this.tenant.run(user, async (tx) => {
      let memberId: string | null = null;
      if (input.memberId) {
        const member = await tx.member.findFirst({
          where: { id: input.memberId, churchId: user.churchId, deletedAt: null },
          select: { id: true },
        });
        if (!member) throw new NotFoundException('member not found');
        memberId = member.id;
      }
      const a = await tx.announcement.create({
        data: {
          churchId: user.churchId,
          title: input.title,
          body: input.body,
          category: input.category ?? 'GENERAL',
          channels: input.channels ?? ['INAPP'],
          audience: {} as any,
          memberId,
          ...(photo ? { photoDataUrl: photo } : {}),
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

  @RequirePermissions('campaigns:read')
  @Get()
  list(@Req() req: AuthedRequest, @Query('category') category?: string) {
    return this.svc.list(req.user!, category);
  }

  /** Detail (with the published photo, e.g. the deceased) behind a click. */
  @RequirePermissions('campaigns:read')
  @Get(':id')
  getOne(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.svc.getOne(req.user!, id);
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
