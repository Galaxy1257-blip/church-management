// Outreach: the record of an evangelism or visitation outing, and the people met there.
import { BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, Post, Query, Req } from '@nestjs/common';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { appendAudit, Db } from '@chms/db';
import {
  isCalendarDateKey,
  isOutreachKind,
  localDateKey,
  normalizeGhPhone,
  outreachClampCount,
  outreachPlace,
  type OutreachKind,
} from '@chms/shared';
import { ForModule, RequirePermissions } from '../common/decorators';
import { AuthedRequest, AuthUser } from '../common/guards';
import { TenantService } from '../common/tenant';

class CreateActivityDto {
  @IsOptional() @IsString() dateKey?: string; // YYYY-MM-DD church-local
  @IsOptional() @IsString() kind?: string;
  @IsString() @MinLength(1) place!: string;
  @IsOptional() @IsString() leaderName?: string;
  @IsOptional() @IsString() peopleReached?: string; // integer
  @IsOptional() @IsString() notes?: string;
}

class CreateContactDto {
  @IsString() @MinLength(1) firstName!: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() phoneE164?: string;
  @IsOptional() @IsString() note?: string;
}

@Injectable()
export class OutreachService {
  constructor(private readonly tenant: TenantService) {}

  async list(user: AuthUser, limit: number) {
    return this.tenant.run(user, async (tx: Db) => {
      const activities = await tx.outreachActivity.findMany({
        where: { churchId: user.churchId },
        orderBy: { dateKey: 'desc' },
        take: Math.min(100, Math.max(1, limit || 50)),
      });
      const counts = await tx.outreachContact.groupBy({
        by: ['activityId'],
        where: { churchId: user.churchId },
        _count: { _all: true },
      });
      const byActivity = new Map(counts.map((c) => [c.activityId, c._count._all]));
      return activities.map((a) => ({
        id: a.id,
        dateKey: a.dateKey,
        kind: a.kind as OutreachKind,
        place: a.place,
        leaderName: a.leaderName,
        peopleReached: a.peopleReached,
        notes: a.notes,
        createdAt: a.createdAt,
        contactCount: byActivity.get(a.id) ?? 0,
      }));
    });
  }

  async create(user: AuthUser, dto: CreateActivityDto, ip?: string) {
    const kind: OutreachKind = dto.kind && isOutreachKind(dto.kind) ? dto.kind : 'OTHER';
    const place = outreachPlace(dto.place);
    if (!place) throw new BadRequestException('Where did the outing happen?');
    const peopleReached = outreachClampCount(dto.peopleReached) ?? 0;
    return this.tenant.run(user, async (tx: Db) => {
      const church = await tx.church.findUniqueOrThrow({
        where: { id: user.churchId },
        select: { timezone: true },
      });
      const dateKey =
        dto.dateKey && isCalendarDateKey(dto.dateKey) ? dto.dateKey : localDateKey(church.timezone ?? 'Africa/Accra');
      const activity = await tx.outreachActivity.create({
        data: {
          churchId: user.churchId,
          dateKey,
          kind,
          place,
          leaderName: dto.leaderName?.trim() || null,
          peopleReached,
          notes: dto.notes?.trim() || null,
          createdBy: user.userId,
        },
      });
      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: 'outreach.create',
        entity: 'OutreachActivity',
        entityId: activity.id,
        before: null,
        after: { dateKey, kind, place, peopleReached },
        ip,
      });
      return { id: activity.id, dateKey, kind, place, peopleReached };
    });
  }

  async addContact(user: AuthUser, activityId: string, dto: CreateContactDto, ip?: string) {
    const firstName = dto.firstName.trim();
    if (!firstName) throw new BadRequestException("What is the person's first name?");
    const phone = dto.phoneE164 ? normalizeGhPhone(dto.phoneE164) : null;
    return this.tenant.run(user, async (tx: Db) => {
      const activity = await tx.outreachActivity.findFirst({
        where: { id: activityId, churchId: user.churchId },
      });
      if (!activity) throw new NotFoundException('That outing could not be found.');
      const contact = await tx.outreachContact.create({
        data: {
          churchId: user.churchId,
          activityId,
          firstName,
          lastName: dto.lastName?.trim() || null,
          phoneE164: phone,
          note: dto.note?.trim() || null,
          createdBy: user.userId,
        },
      });
      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: 'outreach.contact',
        entity: 'OutreachContact',
        entityId: contact.id,
        before: null,
        after: { activityId, firstName, phone },
        ip,
      });
      return { id: contact.id, firstName, phone };
    });
  }
}

// Switched off in Settings → App sections means switched off here too.
@ForModule('outreach')
@Controller('outreach')
export class OutreachController {
  constructor(private readonly outreach: OutreachService) {}

  @RequirePermissions('outreach:read')
  @Get()
  list(@Req() req: AuthedRequest, @Query('limit') limit?: string) {
    return this.outreach.list(req.user!, Number(limit ?? '50'));
  }

  @RequirePermissions('outreach:write')
  @Post()
  create(@Req() req: AuthedRequest, @Body() dto: CreateActivityDto) {
    return this.outreach.create(req.user!, dto, req.ip);
  }

  @RequirePermissions('outreach:write')
  @Post(':id/contacts')
  addContact(@Req() req: AuthedRequest, @Param('id') id: string, @Body() dto: CreateContactDto) {
    return this.outreach.addContact(req.user!, id, dto, req.ip);
  }
}

@Module({
  providers: [TenantService, OutreachService],
  controllers: [OutreachController],
})
export class OutreachModule {}