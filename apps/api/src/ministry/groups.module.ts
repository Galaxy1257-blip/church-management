// Groups/cells: CRUD, weekly meeting reports (offline-safe client ids),
// meeting attendance incl. guests. The detail view is what the group cards
// open: leader, members, meetings/events and adding people.
import {
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { appendAudit, Db } from '@chms/db';
import { uuidv7 } from '@chms/shared';
import { RequirePermissions } from '../common/decorators';
import { AuthedRequest, AuthUser } from '../common/guards';
import { TenantService } from '../common/tenant';

class GroupDto {
  @IsString() @MinLength(1) type!: string; // DEPARTMENT|CELL|MINISTRY
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() leaderId?: string;
  @IsOptional() @IsString() branchId?: string;
}
class GroupUpdateDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsIn(['DEPARTMENT', 'CELL', 'MINISTRY', 'CHOIR', 'YOUTH', 'WOMEN', 'MEN', 'OTHER']) type?: string;
  @IsOptional() @IsString() leaderId?: string | null;
}
class GroupMemberDto {
  @IsString() memberId!: string;
  @IsOptional() @IsIn(['MEMBER', 'LEADER', 'ASSISTANT']) role?: string;
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

const MEMBER_SUMMARY = {
  id: true,
  memberNo: true,
  firstName: true,
  lastName: true,
  phoneE164: true,
  email: true,
  address: true,
  status: true,
  gender: true,
  photoDataUrl: true,
} as const;

@Injectable()
export class GroupsService {
  constructor(private readonly tenant: TenantService) {}

  private async leaders(tx: Db, churchId: string, groups: { leaderId: string | null }[]) {
    const ids = [...new Set(groups.map((g) => g.leaderId).filter((v): v is string => Boolean(v)))];
    if (!ids.length) return new Map<string, { id: string; firstName: string; lastName: string; phoneE164: string | null }>();
    const rows = await tx.member.findMany({
      where: { churchId, id: { in: ids } },
      select: { id: true, firstName: true, lastName: true, phoneE164: true },
    });
    return new Map(rows.map((r) => [r.id, r]));
  }

  list(user: AuthUser) {
    return this.tenant.run(user, async (tx) => {
      const groups = await tx.group.findMany({
        where: { churchId: user.churchId },
        include: { _count: { select: { members: true } } },
        orderBy: { name: 'asc' },
      });
      const leaderById = await this.leaders(tx, user.churchId, groups);
      return groups.map((g) => ({ ...g, leader: g.leaderId ? leaderById.get(g.leaderId) ?? null : null }));
    });
  }

  /** What a group card opens: leader, members, recent meetings/events. */
  detail(user: AuthUser, id: string) {
    return this.tenant.run(user, async (tx) => {
      const group = await tx.group.findFirst({ where: { id, churchId: user.churchId } });
      if (!group) throw new NotFoundException('group not found');
      const [rows, meetings] = await Promise.all([
        tx.groupMember.findMany({
          where: { groupId: id },
          include: { member: { select: MEMBER_SUMMARY } },
        }),
        tx.groupMeeting.findMany({
          where: { churchId: user.churchId, groupId: id },
          include: { attendance: true },
          orderBy: { heldAt: 'desc' },
          take: 12,
        }),
      ]);
      const leader = group.leaderId
        ? await tx.member.findFirst({
            where: { churchId: user.churchId, id: group.leaderId },
            select: { id: true, firstName: true, lastName: true, phoneE164: true, photoDataUrl: true },
          })
        : null;
      const members = rows
        .map((r) => ({ ...r.member, groupRole: r.role }))
        .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
      return {
        ...group,
        leader,
        members,
        meetings: meetings.map((m) => ({ ...m, presentCount: m.attendance.filter((a) => a.present).length })),
      };
    });
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

  update(user: AuthUser, id: string, patch: GroupUpdateDto, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const group = await tx.group.findFirst({ where: { id, churchId: user.churchId } });
      if (!group) throw new NotFoundException('group not found');
      if (patch.leaderId) {
        const leader = await tx.member.findFirst({
          where: { id: patch.leaderId, churchId: user.churchId, deletedAt: null },
          select: { id: true },
        });
        if (!leader) throw new NotFoundException('leader not found');
      }
      const updated = await tx.group.update({
        where: { id },
        data: {
          ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
          ...(patch.type !== undefined ? { type: patch.type } : {}),
          ...(patch.leaderId !== undefined ? { leaderId: patch.leaderId || null } : {}),
        },
      });
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: 'group.update', entity: 'Group', entityId: id, before: group, after: updated, ip });
      return updated;
    });
  }

  addMember(user: AuthUser, id: string, input: GroupMemberDto, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const group = await tx.group.findFirst({ where: { id, churchId: user.churchId }, select: { id: true } });
      if (!group) throw new NotFoundException('group not found');
      const member = await tx.member.findFirst({
        where: { id: input.memberId, churchId: user.churchId, deletedAt: null },
        select: { id: true, firstName: true, lastName: true },
      });
      if (!member) throw new NotFoundException('member not found');
      const row = await tx.groupMember.upsert({
        where: { groupId_memberId: { groupId: id, memberId: member.id } },
        create: { groupId: id, memberId: member.id, role: input.role ?? 'MEMBER' },
        update: { role: input.role ?? 'MEMBER' },
      });
      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: 'group.member.add',
        entity: 'GroupMember',
        entityId: `${id}:${member.id}`,
        after: row,
        ip,
      });
      return { ...row, member };
    });
  }

  removeMember(user: AuthUser, id: string, memberId: string, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const group = await tx.group.findFirst({ where: { id, churchId: user.churchId } });
      if (!group) throw new NotFoundException('group not found');
      await tx.groupMember.deleteMany({ where: { groupId: id, memberId } });
      if (group.leaderId === memberId) {
        await tx.group.update({ where: { id }, data: { leaderId: null } });
      }
      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: 'group.member.remove',
        entity: 'GroupMember',
        entityId: `${id}:${memberId}`,
        ip,
      });
      return { removed: true };
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

  // Specific paths first: /groups/:id would otherwise swallow them.
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

  @RequirePermissions('members:read')
  @Get(':id')
  detail(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.svc.detail(req.user!, id);
  }

  @RequirePermissions('members:write')
  @Patch(':id')
  update(@Req() req: AuthedRequest, @Param('id') id: string, @Body() dto: GroupUpdateDto) {
    return this.svc.update(req.user!, id, dto, req.ip);
  }

  @RequirePermissions('members:write')
  @Post(':id/members')
  addMember(@Req() req: AuthedRequest, @Param('id') id: string, @Body() dto: GroupMemberDto) {
    return this.svc.addMember(req.user!, id, dto, req.ip);
  }

  @RequirePermissions('members:write')
  @Delete(':id/members/:memberId')
  removeMember(@Req() req: AuthedRequest, @Param('id') id: string, @Param('memberId') memberId: string) {
    return this.svc.removeMember(req.user!, id, memberId, req.ip);
  }
}

@Module({
  providers: [TenantService, GroupsService],
  controllers: [GroupsController],
})
export class GroupsModule {}
