// Groups/cells: CRUD, weekly meeting reports (offline-safe client ids),
// meeting attendance incl. guests.
import { Body, Controller, Get, Injectable, Module, Param, Post, Req } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { appendAudit } from '@chms/db';
import { uuidv7 } from '@chms/shared';
import { RequirePermissions } from '../common/decorators';
import { AuthedRequest } from '../common/guards';
import { TenantService } from '../common/tenant';

class GroupDto {
  @IsString() @MinLength(1) type!: string; // DEPARTMENT|CELL|MINISTRY
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() leaderId?: string;
  @IsOptional() @IsString() branchId?: string;
}
class MeetingDto {
  @IsString() groupId!: string;
  @IsString() heldAt!: string;
  @IsOptional() @IsString() topic?: string;
  @IsOptional() @IsInt() @Min(0) offeringMinor?: number;
}
class AttendanceDto {
  @IsString() memberId?: string;
  @IsOptional() @IsString() guestName?: string;
  @IsOptional() @IsBoolean() present?: boolean;
}

@Injectable()
export class GroupsService {
  constructor(private readonly tenant: TenantService) {}

  list(user: AuthUser) {
    return this.tenant.run(user, (tx) =>
      tx.group.findMany({ where: { churchId: user.churchId }, include: { _count: { select: { members: true } } } }),
    );
  }

  create(user: AuthUser, input: GroupDto, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const g = await tx.group.create({
        data: {
          churchId: user.churchId,
          branchId: input.branchId ?? null,
          type: input.type,
          name: input.name,
          leaderId: input.leaderId ?? null,
        },
      });
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: 'group.create', entity: 'Group', entityId: g.id, after: g, ip });
      return g;
    });
  }

  meetings(user: AuthUser, groupId: string) {
    return this.tenant.run(user, (tx) =>
      tx.groupMeeting.findMany({
        where: { churchId: user.churchId, groupId },
        include: { attendance: true },
        orderBy: { heldAt: 'desc' },
        take: 100,
      }),
    );
  }

  /** Offline-safe: client may reuse ids; unique(meetingId, memberId) dedupes. */
  recordMeeting(user: AuthUser, input: MeetingDto, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const group = await tx.group.findFirst({ where: { id: input.groupId, churchId: user.churchId } });
      if (!group) throw new Error('group not found');
      const m = await tx.groupMeeting.create({
        data: {
          churchId: user.churchId,
          groupId: input.groupId,
          heldAt: new Date(input.heldAt),
          topic: input.topic ?? null,
          offeringMinor: input.offeringMinor ?? null,
          reportedBy: user.userId,
        },
      });
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: 'group.meeting.record', entity: 'GroupMeeting', entityId: m.id, ip });
      return m;
    });
  }

  async addAttendance(user: AuthUser, meetingId: string, input: AttendanceDto) {
    return this.tenant.run(user, async (tx) => {
      const row = await tx.groupAttendance.upsert({
        where: { meetingId_memberId: { meetingId, memberId: input.memberId ?? uuidv7() } },
        create: {
          meetingId,
          memberId: input.memberId ?? null,
          guestName: input.guestName ?? null,
          present: input.present ?? true,
        },
        update: { present: input.present ?? true },
      });
      return row;
    });
  }
}

import { AuthUser } from '../common/guards';

@Controller('groups')
export class GroupsController {
  constructor(private readonly svc: GroupsService) {}

  @RequirePermissions('members:read')
  @Get()
  list(@Req() req: AuthedRequest) {
    return this.svc.list(req.user!);
  }

  @RequirePermissions('members:write')
  @Post()
  create(@Req() req: AuthedRequest, @Body() dto: GroupDto) {
    return this.svc.create(req.user!, dto, req.ip);
  }

  @RequirePermissions('members:read')
  @Get(':id/meetings')
  meetings(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.svc.meetings(req.user!, id);
  }

  @RequirePermissions('members:write')
  @Post('meetings')
  recordMeeting(@Req() req: AuthedRequest, @Body() dto: MeetingDto) {
    return this.svc.recordMeeting(req.user!, dto, req.ip);
  }

  @RequirePermissions('members:write')
  @Post('meetings/:meetingId/attendance')
  addAttendance(@Req() req: AuthedRequest, @Param('meetingId') meetingId: string, @Body() dto: AttendanceDto) {
    return this.svc.addAttendance(req.user!, meetingId, dto);
  }
}

@Module({
  providers: [TenantService, GroupsService],
  controllers: [GroupsController],
})
export class GroupsModule {}
