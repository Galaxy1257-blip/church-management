// Program tracking: a church program repeats on a member's date (birthday,
// wedding anniversary, salvation day...). Leaders see whose milestone is
// coming within the reminder window; approving one pushes a whole-church
// notification to the companion (memberId null = everyone). The dedupe key
// `program:{id}:{memberId}:{MM-DD}` lets a milestone be sent once per year.
import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Injectable, Module, Param, Post, Put, Req } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { appendAudit } from '@chms/db';
import {
  anniversaryWithin,
  isProgramDateField,
  memberProgramDate,
  nextAnniversary,
  ordinalSuffix,
  PROGRAM_DATE_LABELS,
  type ProgramDateField,
} from '@chms/shared';
import { ForModule, RequirePermissions } from '../common/decorators';
import { AuthedRequest, AuthUser } from '../common/guards';
import { TenantService } from '../common/tenant';

class ProgramDto {
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() dateField?: string;
  @IsOptional() @IsInt() @Min(1) @Max(60) remindDays?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

const DAY = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dayLabel(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

function milestoneKey(programId: string, memberId: string, next: Date): string {
  return `program:${programId}:${memberId}:${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

const MEMBER_DATE_SELECT = {
  id: true, firstName: true, lastName: true, memberNo: true,
  dob: true, joinedAt: true, salvationDate: true, baptismDate: true, marriageDate: true, ordinationDate: true,
} as const;

@Injectable()
export class ProgramsService {
  constructor(private readonly tenant: TenantService) {}

  list(user: AuthUser) {
    return this.tenant.run(user, (tx) =>
      tx.program.findMany({ where: { churchId: user.churchId }, orderBy: { createdAt: 'asc' } }),
    );
  }

  create(user: AuthUser, input: ProgramDto, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const program = await tx.program.create({
        data: {
          churchId: user.churchId,
          name: input.name.trim(),
          dateField: isProgramDateField(input.dateField) ? input.dateField : 'DOB',
          remindDays: input.remindDays ?? 7,
          active: input.active ?? true,
          createdBy: user.userId,
        },
      });
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: 'program.create', entity: 'Program', entityId: program.id, after: { name: program.name }, ip });
      return program;
    });
  }

  update(user: AuthUser, id: string, input: ProgramDto, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const existing = await tx.program.findFirst({ where: { id, churchId: user.churchId } });
      if (!existing) throw new BadRequestException('program not found');
      const program = await tx.program.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.dateField !== undefined && isProgramDateField(input.dateField) ? { dateField: input.dateField } : {}),
          ...(input.remindDays !== undefined ? { remindDays: input.remindDays } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
        },
      });
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: 'program.update', entity: 'Program', entityId: id, after: { name: program.name, active: program.active }, ip });
      return program;
    });
  }

  remove(user: AuthUser, id: string, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const existing = await tx.program.findFirst({ where: { id, churchId: user.churchId } });
      if (!existing) throw new BadRequestException('program not found');
      await tx.program.delete({ where: { id } });
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: 'program.delete', entity: 'Program', entityId: id, ip });
      return { deleted: true };
    });
  }

  /** Whose milestone is coming, per program, with this year's approval state. */
  async upcoming(user: AuthUser) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return this.tenant.run(user, async (tx) => {
      const programs = await tx.program.findMany({
        where: { churchId: user.churchId, active: true },
        orderBy: { name: 'asc' },
      });
      const members = await tx.member.findMany({
        where: { churchId: user.churchId, deletedAt: null, status: 'ACTIVE' },
        select: MEMBER_DATE_SELECT,
        take: 2000,
      });
      const approvedKeys = new Set(
        (await tx.notification.findMany({
          where: { churchId: user.churchId, kind: 'PROGRAM', dedupeKey: { startsWith: 'program:' } },
          select: { dedupeKey: true },
        })).map((n) => n.dedupeKey),
      );
      const out: Record<string, unknown>[] = [];
      for (const program of programs) {
        const field = isProgramDateField(program.dateField) ? (program.dateField as ProgramDateField) : 'DOB';
        for (const m of members) {
          const date = memberProgramDate(m as never, field);
          if (!date || !anniversaryWithin(date, today, program.remindDays)) continue;
          const a = nextAnniversary(date, today)!;
          const key = milestoneKey(program.id, m.id, a.next);
          out.push({
            programId: program.id,
            programName: program.name,
            dateField: field,
            dateLabel: PROGRAM_DATE_LABELS[field],
            memberId: m.id,
            name: `${m.firstName} ${m.lastName}`,
            memberNo: m.memberNo,
            nextAt: a.next.toISOString(),
            ordinal: a.ordinal,
            ordinalLabel: ordinalSuffix(a.ordinal),
            dayLabel: dayLabel(a.next),
            approved: approvedKeys.has(key),
          });
        }
      }
      out.sort((a, b) => String(a.nextAt).localeCompare(String(b.nextAt)));
      return { today: today.toISOString(), items: out };
    });
  }

  /** Approve one milestone: whole-church notification, once per year per member. */
  approve(user: AuthUser, programId: string, memberId: string, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const program = await tx.program.findFirst({ where: { id: programId, churchId: user.churchId } });
      if (!program) throw new BadRequestException('program not found');
      const field = isProgramDateField(program.dateField) ? (program.dateField as ProgramDateField) : 'DOB';
      const member = await tx.member.findFirst({
        where: { id: memberId, churchId: user.churchId, deletedAt: null },
        select: MEMBER_DATE_SELECT,
      });
      if (!member) throw new BadRequestException('member not found');
      const date = memberProgramDate(member as never, field);
      if (!date) throw new BadRequestException('this member has no date for that program');
      const a = nextAnniversary(date, new Date())!;
      if (a.next.getTime() < Date.now() - DAY) throw new BadRequestException('that milestone has already passed this year');
      const key = milestoneKey(program.id, member.id, a.next);
      const existing = await tx.notification.findUnique({ where: { churchId_dedupeKey: { churchId: user.churchId, dedupeKey: key } } });
      if (existing) {
        throw new ConflictException(`That ${program.name.toLowerCase()} was already sent to the church this year.`);
      }
      const name = `${member.firstName} ${member.lastName}`;
      const title = `${name}'s ${ordinalSuffix(a.ordinal)} ${program.name}`;
      const body = `It's ${name}'s ${ordinalSuffix(a.ordinal)} ${program.name.toLowerCase()} on ${dayLabel(a.next)} — let them know they're loved.`;
      const notification = await tx.notification.create({
        data: {
          churchId: user.churchId,
          kind: 'PROGRAM',
          title,
          body,
          memberId: null,
          scheduledFor: new Date(),
          dedupeKey: key,
          createdBy: user.userId,
        },
      });
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: 'program.approve', entity: 'Notification', entityId: notification.id, after: { title }, ip });
      return { approved: true, title, body };
    });
  }
}

@ForModule('programs')
@Controller('programs')
export class ProgramsController {
  constructor(private readonly svc: ProgramsService) {}

  @RequirePermissions('campaigns:read')
  @Get()
  list(@Req() req: AuthedRequest) {
    return this.svc.list(req.user!);
  }

  @RequirePermissions('campaigns:read')
  @Get('upcoming')
  upcoming(@Req() req: AuthedRequest) {
    return this.svc.upcoming(req.user!);
  }

  @RequirePermissions('campaigns:write')
  @Post()
  create(@Req() req: AuthedRequest, @Body() dto: ProgramDto) {
    return this.svc.create(req.user!, dto, req.ip);
  }

  @RequirePermissions('campaigns:write')
  @Put(':id')
  update(@Req() req: AuthedRequest, @Param('id') id: string, @Body() dto: ProgramDto) {
    return this.svc.update(req.user!, id, dto, req.ip);
  }

  @RequirePermissions('campaigns:write')
  @Delete(':id')
  remove(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.svc.remove(req.user!, id, req.ip);
  }

  @RequirePermissions('campaigns:write')
  @Post(':id/milestones/:memberId/approve')
  approve(@Req() req: AuthedRequest, @Param('id') id: string, @Param('memberId') memberId: string) {
    return this.svc.approve(req.user!, id, memberId, req.ip);
  }
}

@Module({ providers: [TenantService, ProgramsService], controllers: [ProgramsController] })
export class ProgramsModule {}
