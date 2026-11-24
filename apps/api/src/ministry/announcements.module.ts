// Announcements are saved once, then delivered per channel by the worker at
// publishAt. SMS uses the same consent, opt-out, quiet-hours and wallet rules as campaigns.
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { appendAudit, type Db } from '@chms/db';
import { smsSegments } from '@chms/shared';
import { ForModule, RequirePermissions } from '../common/decorators';
import { normalizePhotoDataUrl } from '../common/photo';
import { AuthedRequest, AuthUser } from '../common/guards';
import { TenantService } from '../common/tenant';
import { reminderRows } from './reminders.module';

const CHANNELS = ['INAPP', 'PUSH', 'SMS'] as const;
const MAX_SCHEDULE_MS = 365 * 86_400_000;
const DELIVERY_SELECT = {
  id: true,
  channel: true,
  status: true,
  dueAt: true,
  attempts: true,
  sentAt: true,
  lastError: true,
} as const;

class AnnouncementDto {
  @IsString() @MinLength(1) @MaxLength(120) title!: string;
  @IsString() @MinLength(1) @MaxLength(2000) body!: string;
  @IsOptional() @IsIn(['GENERAL', 'FUNERAL', 'OUTDOORING', 'EVENT', 'ALERT']) category?: string;
  @IsOptional() @IsArray() @IsIn(CHANNELS, { each: true }) channels?: string[];
  @IsOptional() @IsString() publishAt?: string;
  @IsOptional() @IsString() expiresAt?: string;
  @IsOptional() @IsString() memberId?: string;
  @IsOptional() @IsString() photoDataUrl?: string;
  @IsOptional() @IsString() programAt?: string;
  @IsOptional() @IsArray() @IsIn([7, 3, 1], { each: true }) remindOffsets?: number[];
}

class RescheduleDto {
  @IsString() @MinLength(1) publishAt!: string;
}

function parseInstant(value: string | undefined, fallback: Date, label: string): Date {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new BadRequestException(`${label} is not a valid date and time.`);
  return parsed;
}

function futureInstant(value: string | undefined, fallback: Date, label: string): Date {
  const parsed = parseInstant(value, fallback, label);
  if (parsed.getTime() > fallback.getTime() + MAX_SCHEDULE_MS) {
    throw new BadRequestException(`${label} must be within the next year.`);
  }
  return parsed;
}

function validateWindow(publishAt: Date, expiresAt: Date | null): void {
  if (expiresAt && expiresAt.getTime() <= publishAt.getTime()) {
    throw new BadRequestException('The expiry must be after the publishing time.');
  }
}

function normalizedChannels(channels: string[] | undefined): string[] {
  const selected = [...new Set(channels ?? ['INAPP'])];
  if (!selected.length || selected.some((channel) => !CHANNELS.includes(channel as (typeof CHANNELS)[number]))) {
    throw new BadRequestException('Choose in-app, phone notification or SMS.');
  }
  return selected;
}

function deliveryData(churchId: string, announcementId: string, channels: string[], dueAt: Date) {
  return channels.map((channel) => ({ churchId, announcementId, channel, status: 'PENDING', dueAt }));
}

async function lockAnnouncement(tx: Db, churchId: string, id: string): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Announcement"
    WHERE "id"::text = ${id} AND "churchId" = ${churchId}::uuid
    FOR UPDATE
  `;
  if (!rows.length) throw new NotFoundException('announcement not found');
}

async function hasActiveDelivery(tx: Db, announcementId: string, now: Date): Promise<boolean> {
  const row = await tx.announcementDelivery.findFirst({
    where: { announcementId, status: 'PROCESSING', leaseUntil: { gt: now } },
    select: { id: true },
  });
  return row !== null;
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

  list(user: AuthUser, category?: string, pending = false) {
    return this.tenant.run(user, async (tx) => {
      const rows = await tx.announcement.findMany({
        where: {
          churchId: user.churchId,
          // The leaders' queue is the pending member notices; the normal list is
          // what everybody may see.
          moderation: pending ? 'PENDING' : 'APPROVED',
          ...(pending ? {} : { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }),
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
          moderation: true,
          submittedByMemberId: true,
          cancelledAt: true,
          deliveries: { select: DELIVERY_SELECT, orderBy: { channel: 'asc' } },
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
      const a = await tx.announcement.findFirst({
        where: { id, churchId: user.churchId },
        include: { deliveries: { select: DELIVERY_SELECT, orderBy: { channel: 'asc' } } },
      });
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

  async create(user: AuthUser, input: AnnouncementDto, ip?: string) {
    const photo = await normalizePhotoDataUrl(input.photoDataUrl);
    return this.tenant.run(user, async (tx) => {
      const now = new Date();
      const publishAt = futureInstant(input.publishAt, now, 'Publishing time');
      const expiresAt = input.expiresAt ? parseInstant(input.expiresAt, now, 'Expiry') : null;
      validateWindow(publishAt, expiresAt);
      const channels = normalizedChannels(input.channels);
      if (channels.includes('SMS') && smsSegments(`${input.title.trim()}: ${input.body.trim()}`) > 10) {
        throw new BadRequestException('The SMS is too long. Shorten the title and message to 10 text segments or fewer.');
      }
      const programAt = input.programAt ? parseInstant(input.programAt, now, 'Program time') : null;

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
          title: input.title.trim(),
          body: input.body.trim(),
          category: input.category ?? 'GENERAL',
          channels,
          audience: {},
          memberId,
          ...(photo ? { photoDataUrl: photo } : {}),
          publishAt,
          expiresAt,
          createdBy: user.userId,
        },
      });
      await tx.announcementDelivery.createMany({
        data: deliveryData(user.churchId, a.id, channels, publishAt),
      });
      const deliveries = await tx.announcementDelivery.findMany({
        where: { announcementId: a.id },
        select: DELIVERY_SELECT,
        orderBy: { channel: 'asc' },
      });

      if (programAt && (input.remindOffsets ?? []).length) {
        const rows = reminderRows({
          title: a.title,
          body: a.body,
          programAt,
          offsets: input.remindOffsets ?? [],
          now: publishAt,
          sourceId: a.id,
          kind: 'ANNOUNCEMENT',
        }).filter((r) => r.scheduledFor.getTime() > publishAt.getTime());
        if (rows.length) {
          await tx.notification.createMany({
            data: rows.map((r) => ({ ...r, dedupeKey: `${a.id}:${r.dedupeKey}`, churchId: user.churchId, createdBy: user.userId })),
          });
        }
      }
      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: 'announcement.create',
        entity: 'Announcement',
        entityId: a.id,
        ip,
        after: { channels, publishAt: publishAt.toISOString() },
      });
      return { ...a, deliveries };
    });
  }

  moderate(user: AuthUser, id: string, approve: boolean, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      await lockAnnouncement(tx, user.churchId, id);
      const a = await tx.announcement.findFirst({ where: { id, churchId: user.churchId } });
      if (!a) throw new NotFoundException('announcement not found');
      if (a.cancelledAt) throw new ConflictException('This announcement was cancelled.');
      if (a.moderation !== 'PENDING') throw new ConflictException('A leader has already decided this announcement.');
      const updated = await tx.announcement.update({
        where: { id },
        data: {
          moderation: approve ? 'APPROVED' : 'REJECTED',
          ...(approve ? { createdBy: user.userId } : {}),
        },
      });
      if (approve) {
        await tx.announcementDelivery.createMany({
          data: deliveryData(user.churchId, id, a.channels, a.publishAt),
          skipDuplicates: true,
        });
      } else {
        await tx.announcementDelivery.updateMany({
          where: { announcementId: id, status: 'PENDING' },
          data: { status: 'CANCELLED', leaseUntil: null, nextAttemptAt: null },
        });
      }
      const deliveries = await tx.announcementDelivery.findMany({
        where: { announcementId: id },
        select: DELIVERY_SELECT,
        orderBy: { channel: 'asc' },
      });
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: approve ? 'announcement.approve' : 'announcement.reject', entity: 'Announcement', entityId: id, ip });
      return { ...updated, deliveries };
    });
  }

  cancel(user: AuthUser, id: string, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const now = new Date();
      await lockAnnouncement(tx, user.churchId, id);
      const a = await tx.announcement.findFirst({ where: { id, churchId: user.churchId } });
      if (!a) throw new NotFoundException('announcement not found');
      if (a.cancelledAt) return a;
      if (a.publishAt.getTime() <= now.getTime()) {
        throw new ConflictException('This announcement has already reached its publishing time.');
      }
      if (await hasActiveDelivery(tx, id, now)) {
        throw new ConflictException('Delivery has already started. Try again after it finishes.');
      }
      const updated = await tx.announcement.update({ where: { id }, data: { cancelledAt: now } });
      await tx.announcementDelivery.updateMany({
        where: { announcementId: id, status: 'PENDING' },
        data: { status: 'CANCELLED', leaseUntil: null, nextAttemptAt: null },
      });
      const deliveries = await tx.announcementDelivery.findMany({
        where: { announcementId: id },
        select: DELIVERY_SELECT,
        orderBy: { channel: 'asc' },
      });
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: 'announcement.cancel', entity: 'Announcement', entityId: id, ip });
      return { ...updated, deliveries };
    });
  }

  reschedule(user: AuthUser, id: string, input: RescheduleDto, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const now = new Date();
      await lockAnnouncement(tx, user.churchId, id);
      const a = await tx.announcement.findFirst({ where: { id, churchId: user.churchId } });
      if (!a) throw new NotFoundException('announcement not found');
      if (a.cancelledAt) throw new ConflictException('A cancelled announcement cannot be rescheduled.');
      if (a.publishAt.getTime() <= now.getTime()) {
        throw new ConflictException('This announcement has already reached its publishing time.');
      }
      if (a.moderation !== 'APPROVED') throw new ConflictException('Approve the announcement before scheduling it.');
      if (await hasActiveDelivery(tx, id, now)) {
        throw new ConflictException('Delivery has already started. Try again after it finishes.');
      }
      const publishAt = futureInstant(input.publishAt, now, 'Publishing time');
      if (publishAt.getTime() <= now.getTime()) throw new BadRequestException('Choose a publishing time in the future.');
      validateWindow(publishAt, a.expiresAt);
      const updated = await tx.announcement.update({ where: { id }, data: { publishAt } });
      await tx.announcementDelivery.updateMany({
        where: { announcementId: id, status: 'PENDING' },
        data: { dueAt: publishAt, nextAttemptAt: null, lastError: null, leaseUntil: null },
      });
      const deliveries = await tx.announcementDelivery.findMany({
        where: { announcementId: id },
        select: DELIVERY_SELECT,
        orderBy: { channel: 'asc' },
      });
      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: 'announcement.reschedule',
        entity: 'Announcement',
        entityId: id,
        ip,
        before: { publishAt: a.publishAt.toISOString() },
        after: { publishAt: publishAt.toISOString() },
      });
      return { ...updated, deliveries };
    });
  }
}

// Switched off in Settings → App sections means switched off here too.
@ForModule('reach')
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly svc: AnnouncementsService) {}

  @RequirePermissions('campaigns:read')
  @Get()
  list(@Req() req: AuthedRequest, @Query('category') category?: string, @Query('pending') pending?: string) {
    return this.svc.list(req.user!, category, pending === 'true');
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

  @RequirePermissions('campaigns:write')
  @Post(':id/moderate')
  moderate(@Req() req: AuthedRequest, @Param('id') id: string, @Body('approve') approve: boolean) {
    return this.svc.moderate(req.user!, id, approve !== false, req.ip);
  }

  @RequirePermissions('campaigns:write')
  @Post(':id/cancel')
  cancel(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.svc.cancel(req.user!, id, req.ip);
  }

  @RequirePermissions('campaigns:write')
  @Post(':id/reschedule')
  reschedule(@Req() req: AuthedRequest, @Param('id') id: string, @Body() dto: RescheduleDto) {
    return this.svc.reschedule(req.user!, id, dto, req.ip);
  }
}

@Module({
  providers: [TenantService, AnnouncementsService],
  controllers: [AnnouncementsController],
})
export class AnnouncementsModule {}
