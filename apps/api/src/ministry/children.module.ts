// Children's security check-in: dual ticket (child tag + guardian pickup
// code). Checkout requires a guardian listed in MemberGuardian + code match.
import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, Post, Put, Query, Req } from '@nestjs/common';
import { createHash, randomInt } from 'node:crypto';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { DateTime } from 'luxon';
import { appendAudit, Db } from '@chms/db';
import {
  childPickupMessage,
  childPickupSmsGate,
  isRegisterStatus,
  isSundayKey,
  isSundaySchoolDateKey,
  isSundaySchoolSkipped,
  resolveSundaySchoolSkips,
  sundayRegisterWindow,
  uuidv7,
  type RegisterStatus,
} from '@chms/shared';
import { AnyPermission, ForModule, RequirePermissions } from '../common/decorators';
import { ClassScope, classLabelFor, classMemberIds, classMemberWhere, deskMoveChildIds, deskRosterChildIds } from '../common/class-scope';
import { AuthedRequest, AuthUser } from '../common/guards';
import { TenantService } from '../common/tenant';
import { ServicesModule } from '../services/services.module';
import { ServicesService } from '../services/services.service';
import { SmsDispatcher, type DispatchOutcome } from '../sms/sms-dispatcher';
import { SmsModule } from '../sms/sms.module';

/** What the desk is told about the guardian's text — never a promise of delivery. */
export type PickupSms = {
  status: 'QUEUED' | 'OFF' | 'NO_PHONE' | 'NO_CONSENT' | 'OPTED_OUT' | 'BAD_PHONE' | 'NO_BALANCE' | 'QUIET_HOURS';
  guardian: string;
};

@Injectable()
export class ChildrenService {
  constructor(
    private readonly tenant: TenantService,
    private readonly services: ServicesService,
    private readonly sms: SmsDispatcher,
  ) {}

  /**
   * Text the guardian that a child moved. Best-effort: a missing phone, a STOP
   * reply or an empty wallet never blocks the desk. The message is queued inside
   * the same transaction as the check-in, so a rolled-back check-in sends nothing.
   */
  private async notifyGuardian(
    tx: Db,
    user: AuthUser,
    input: { childName: string; guardianId: string; kind: 'IN' | 'OUT'; at: Date; idempotencyKey: string },
  ): Promise<{ view: PickupSms; outcome: DispatchOutcome | null }> {
    const [church, guardian] = await Promise.all([
      tx.church.findUnique({ where: { id: user.churchId }, select: { name: true, timezone: true, settings: true } }),
      tx.member.findFirst({
        where: { id: input.guardianId, churchId: user.churchId },
        select: { firstName: true, lastName: true, phoneE164: true, smsConsent: true },
      }),
    ]);
    const name = guardian ? `${guardian.firstName} ${guardian.lastName}` : 'the guardian';
    const none = (status: PickupSms['status']) => ({ view: { status, guardian: name }, outcome: null });
    if (!church) return none('OFF');
    const gate = childPickupSmsGate({
      settings: church.settings,
      phoneE164: guardian?.phoneE164,
      consent: guardian?.smsConsent === true,
    });
    if (!gate.send) return none(gate.status);
    // The dispatcher exempts transactional sources from STOP, so the guard is
    // made here for a safety notice about someone's own child.
    const optedOut = await tx.smsOptOut.findUnique({
      where: { churchId_phoneE164: { churchId: user.churchId, phoneE164: gate.to } },
    });
    if (optedOut) return none('OPTED_OUT');

    let time: string;
    try {
      time = new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: church.timezone,
      }).format(input.at);
    } catch {
      time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'UTC' }).format(input.at);
    }
    const body = childPickupMessage({ childName: input.childName, churchName: church.name, kind: input.kind, time });
    try {
      const outcome = await this.sms.dispatch(tx, { churchId: user.churchId, toE164: gate.to, body, source: 'NUDGE', idempotencyKey: input.idempotencyKey });
      if (outcome.status === 'QUEUED') return { view: { status: 'QUEUED', guardian: name }, outcome };
      return { view: { status: outcome.reason, guardian: name }, outcome: null };
    } catch {
      return none('BAD_PHONE');
    }
  }

  /**
   * A Sunday School teacher may only move a child from the class the office gave
   * them. The office and the door team keep the whole church — same rule as the
   * care queue (common/class-scope.ts).
   */
  private async assertDeskChild(tx: Db, user: AuthUser, childId: string): Promise<void> {
    const ids = await deskMoveChildIds(tx, user);
    if (ids && !ids.includes(childId)) {
      throw new ForbiddenException('That child is not in your class.');
    }
  }

  async checkInChild(user: AuthUser, input: { serviceId: string; childId: string; guardianId: string }, ip?: string) {
    const now = new Date();
    const { reply, outcome } = await this.tenant.run(user, async (tx) => {
      await this.assertDeskChild(tx, user, input.childId);
      const child = await tx.member.findFirst({ where: { id: input.childId, churchId: user.churchId, deletedAt: null } });
      if (!child) throw new BadRequestException('that child is not in this church');
      const guardian = await tx.memberGuardian.findFirst({
        where: { childId: input.childId, guardianId: input.guardianId, canPickup: true },
      });
      if (!guardian) throw new BadRequestException('that adult is not on the pickup list for this child');
      const tagNo = `T${randomInt(100000, 999999)}`;
      const pickupCode = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const pickupCodeHash = createHash('sha256').update(pickupCode).digest('hex');
      const row = await tx.childCheckIn.upsert({
        where: { serviceId_childId: { serviceId: input.serviceId, childId: input.childId } },
        create: {
          id: uuidv7(),
          churchId: user.churchId,
          serviceId: input.serviceId,
          childId: input.childId,
          guardianId: input.guardianId,
          tagNo,
          pickupCodeHash,
          checkedInAt: now,
        },
        // A child released and brought back in the same service gets a fresh tag
        // and code, and the clock starts again — including who brought them this
        // time. Keeping the old values would print a ticket that no longer opens
        // the door and record the wrong drop-off adult.
        update: {
          guardianId: input.guardianId,
          tagNo,
          pickupCodeHash,
          checkedInAt: now,
          checkedOutAt: null,
          checkedOutBy: null,
          codeAttempts: 0,
        },
      });
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: 'child.checkin', entity: 'ChildCheckIn', entityId: row.id, ip });
      const notice = await this.notifyGuardian(tx, user, {
        childName: `${child.firstName} ${child.lastName}`,
        guardianId: input.guardianId,
        kind: 'IN',
        at: now,
        // A double-tap inside the same minute is one message, not two.
        idempotencyKey: `child-in:${row.id}:${Math.floor(now.getTime() / 60_000)}`,
      });
      return { reply: { id: row.id, tagNo, pickupCode, sms: notice.view }, outcome: notice.outcome }; // code shown/printed once
    });
    if (outcome) this.sms.flush(outcome);
    return reply;
  }

  /**
   * Sundays the church has marked off for Sunday School. The answer is built on
   * the server because the date has to be church-local, not the device's. Every
   * desk role reads it — a teacher needs to know the room is closed by plan —
   * while changing the calendar takes the roster-keeping permission.
   */
  async skips(user: AuthUser) {
    return this.tenant.run(user, async (tx) => {
      const church = await tx.church.findUnique({
        where: { id: user.churchId },
        select: { timezone: true, settings: true },
      });
      return this.sundaySchoolState(church?.settings, church?.timezone);
    });
  }

  async saveSkips(user: AuthUser, dates: unknown, ip?: string) {
    if (!Array.isArray(dates) || dates.some((d) => !isSundaySchoolDateKey(d))) {
      throw new BadRequestException('Pick real calendar days, one per Sunday.');
    }
    const clean = [...new Set(dates as string[])].sort().slice(0, 120);
    return this.tenant.run(user, async (tx) => {
      const church = await tx.church.findUnique({ where: { id: user.churchId }, select: { timezone: true, settings: true } });
      const current = (church?.settings ?? {}) as Record<string, unknown>;
      await tx.church.update({
        where: { id: user.churchId },
        data: { settings: { ...current, sundaySchoolSkips: clean } },
      });
      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: 'children.skips',
        entity: 'Church',
        entityId: user.churchId,
        after: { sundaySchoolSkips: clean },
        ip,
      });
      // Answer from the settings just written — a read through the global client
      // would still see the pre-commit row.
      return this.sundaySchoolState({ ...current, sundaySchoolSkips: clean }, church?.timezone);
    });
  }

  /** Church-local time: only the server knows the church's own zone. */
  private churchNow(timezone: string | null | undefined) {
    const zone = timezone || 'Africa/Accra';
    const now = DateTime.now().setZone(zone);
    return now.isValid ? now : DateTime.now().setZone('Africa/Accra');
  }

  /** The class the office assigned to this user. Never guessed from a role. */
  private assignedClass(user: AuthUser): { bracketId: string; segment: ClassScope['segment'] } | null {
    if (!user.careClassBracketId) return null;
    const segment = user.careClassSegment === 'MALE' || user.careClassSegment === 'FEMALE' ? user.careClassSegment : 'ALL';
    return { bracketId: user.careClassBracketId, segment };
  }

  /**
   * The Sundays a register can be taken on — the eight most recent, oldest
   * first, ending on today when today is Sunday.
   */
  private registerDays(timezone: string | null | undefined): string[] {
    const todayKey = this.churchNow(timezone).toFormat('yyyy-MM-dd');
    return sundayRegisterWindow(todayKey, 8);
  }

  /**
   * One Sunday for the assigned class: each child, their mark and any health
   * note. The note is included here and nowhere else a teacher can read, so it
   * reaches the person looking after the child and no other staff role.
   */
  private async registerView(
    tx: Db,
    user: AuthUser,
    scope: { bracketId: string; segment: ClassScope['segment'] },
    dateKey: string,
    settings: unknown,
  ) {
    const [className, children, marks] = await Promise.all([
      classLabelFor(tx, user.churchId, scope),
      tx.member.findMany({
        where: classMemberWhere(user, scope),
        select: { id: true, firstName: true, lastName: true, allergyNote: true },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
      tx.classRegisterMark.findMany({ where: { churchId: user.churchId, dateKey } }),
    ]);
    const byChild = new Map(marks.map((m) => [m.childId, m.status]));
    const rows = children.map((c) => ({
      id: c.id,
      name: `${c.firstName} ${c.lastName}`,
      allergyNote: c.allergyNote?.trim() || null,
      status: (byChild.get(c.id) as RegisterStatus | undefined) ?? null,
    }));
    const counts = {
      present: rows.filter((r) => r.status === 'PRESENT').length,
      absent: rows.filter((r) => r.status === 'ABSENT').length,
      unmarked: rows.filter((r) => r.status === null).length,
    };
    return {
      className,
      date: dateKey,
      skipped: isSundaySchoolSkipped(settings, dateKey),
      children: rows,
      counts,
    };
  }

  /**
   * The class register. It is keyed to the class the office assigned, not to
   * every child — a teacher takes their own room's register. An unassigned
   * account gets an empty answer rather than somebody else's class.
   */
  async register(user: AuthUser, dateParam?: string) {
    return this.tenant.run(user, async (tx) => {
      const church = await tx.church.findUnique({
        where: { id: user.churchId },
        select: { timezone: true, settings: true },
      });
      const days = this.registerDays(church?.timezone);
      const scope = this.assignedClass(user);
      const latest = days[days.length - 1] ?? this.churchNow(church?.timezone).toFormat('yyyy-MM-dd');
      if (!scope) {
        return { className: null, date: latest, days, skipped: false, children: [], counts: { present: 0, absent: 0, unmarked: 0 } };
      }
      const date = dateParam ?? latest;
      if (!isSundayKey(date)) throw new BadRequestException('The class register runs on Sundays. Pick a Sunday.');
      return { ...(await this.registerView(tx, user, scope, date, church?.settings)), days };
    });
  }

  /**
   * Save one Sunday. The payload is the whole class: a child left out is
   * unmarked, so clearing a mark works. A skipped Sunday has no register.
   */
  async saveRegister(user: AuthUser, input: { date?: unknown; marks?: unknown }, ip?: string) {
    const scope = this.assignedClass(user);
    if (!scope) throw new ForbiddenException('No Sunday School class is assigned to you yet — ask your office to set one.');
    if (!isSundayKey(input.date)) throw new BadRequestException('The class register runs on Sundays. Pick a Sunday.');
    if (!Array.isArray(input.marks)) throw new BadRequestException('Send one mark per child.');
    const marks = new Map<string, RegisterStatus>();
    for (const raw of input.marks) {
      const mark = raw as { childId?: unknown; status?: unknown };
      if (typeof mark.childId !== 'string' || !isRegisterStatus(mark.status)) {
        throw new BadRequestException('Each mark needs a child and Present or Away.');
      }
      marks.set(mark.childId, mark.status);
    }
    const date = input.date;

    return this.tenant.run(user, async (tx) => {
      const church = await tx.church.findUnique({
        where: { id: user.churchId },
        select: { timezone: true, settings: true },
      });
      if (isSundaySchoolSkipped(church?.settings, date)) {
        throw new BadRequestException('Sunday School is marked off that day — there is no register to take.');
      }
      const classIds = await classMemberIds(tx, user, scope);
      const kept = [...marks.keys()];
      if (kept.some((id) => !classIds.includes(id))) throw new ForbiddenException('That child is not in your class.');
      if (classIds.length) {
        await tx.classRegisterMark.deleteMany({
          where: { churchId: user.churchId, dateKey: date, childId: { in: classIds, notIn: kept } },
        });
      }
      for (const [childId, status] of marks) {
        await tx.classRegisterMark.upsert({
          where: { churchId_dateKey_childId: { churchId: user.churchId, dateKey: date, childId } },
          create: { id: uuidv7(), churchId: user.churchId, dateKey: date, childId, status, markedBy: user.userId },
          update: { status, markedBy: user.userId, markedAt: new Date() },
        });
      }
      const present = [...marks.values()].filter((s) => s === 'PRESENT').length;
      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: 'children.register',
        entity: 'ClassRegisterMark',
        entityId: date,
        after: { date, present, absent: marks.size - present, classSize: classIds.length },
        ip,
      });
      return { ...(await this.registerView(tx, user, scope, date, church?.settings)), days: this.registerDays(church?.timezone) };
    });
  }

  private sundaySchoolState(settings: unknown, timezone: string | null | undefined) {
    const local = this.churchNow(timezone);
    const dates = resolveSundaySchoolSkips(settings);
    const today = local.toFormat('yyyy-MM-dd');
    const weekday = local.weekday % 7; // 0 = Sunday, matching ServiceSchedule
    let day = local.startOf('day');
    if (weekday !== 0) day = day.plus({ days: 7 - weekday });
    const upcoming = Array.from({ length: 8 }, (_, i) => {
      const d = day.plus({ weeks: i });
      const date = d.toFormat('yyyy-MM-dd');
      return { date, label: d.toFormat('cccc d LLL'), skipped: dates.includes(date) };
    });
    return { today, isSunday: weekday === 0, skippedToday: dates.includes(today), dates, upcoming };
  }

  /**
   * The service picker for the desk. It asks ServicesService directly instead of
   * sending the caller to GET /services, because that route belongs to the
   * Services section (worship) and a Sunday School that has switched Services off
   * still has to be able to check children in. Going through the service rather
   * than the table keeps the one rule that matters: the same read that opens
   * today's service on the first person in on Sunday morning. A rolling week back
   * is the whole window the desk works in.
   */
  async deskServices(user: AuthUser) {
    const from = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const rows = await this.services.list(user, { from });
    return rows.slice(0, 8).map((s) => ({ id: s.id, name: s.name, status: s.status, startsAt: s.startsAt }));
  }

  /**
   * Who is in the room right now. ChildCheckIn has no relations in the schema,
   * so the names come back in a second read of the member rows.
   */
  async listActive(user: AuthUser, serviceId: string) {
    const rows = await this.tenant.run(user, async (tx) => {
      const mine = await deskMoveChildIds(tx, user);
      const found = await tx.childCheckIn.findMany({
        where: {
          churchId: user.churchId,
          serviceId,
          checkedOutAt: null,
          ...(mine ? { childId: { in: mine } } : {}),
        },
        orderBy: { checkedInAt: 'asc' },
      });
      // A teacher sees their own class inside, not the count of every other room.
      return mine ? found.filter((row) => mine.includes(row.childId)) : found;
    });
    const ids = [...new Set(rows.flatMap((row) => [row.childId, row.guardianId]))];
    const people = await this.tenant.run(user, (tx) =>
      tx.member.findMany({
        where: { churchId: user.churchId, id: { in: ids } },
        select: { id: true, firstName: true, lastName: true },
      }),
    );
    const names = new Map(people.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
    return rows.map((row) => ({
      ...row,
      childName: names.get(row.childId) ?? 'Unknown child',
      guardianName: names.get(row.guardianId) ?? 'Unknown guardian',
    }));
  }

  /**
   * Children this church has registered, each with the people allowed to pick
   * them up. Check-in desks work from names, not member UUIDs, so the picker
   * needs both lists in one call. A child is defined here as a member with a
   * recorded guardian.
   *
   * A Sunday School teacher gets only their own class — see deskRosterChildIds.
   * The office (members:write) gets the whole list, exactly as before.
   */
  roster(user: AuthUser) {
    return this.tenant.run(user, async (tx) => {
      const mine = await deskRosterChildIds(tx, user);
      const links = await tx.memberGuardian.findMany({
        where: {
          canPickup: true,
          child: { churchId: user.churchId, deletedAt: null, status: 'ACTIVE', ...(mine ? { id: { in: mine } } : {}) },
        },
        include: {
          child: { select: { id: true, firstName: true, lastName: true, memberNo: true } },
          guardian: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { child: { firstName: 'asc' } },
      });
      const byChild = new Map<
        string,
        { id: string; name: string; memberNo: string; guardians: { id: string; name: string }[] }
      >();
      for (const link of links) {
        const entry = byChild.get(link.child.id) ?? {
          id: link.child.id,
          name: `${link.child.firstName} ${link.child.lastName}`,
          memberNo: link.child.memberNo,
          guardians: [],
        };
        entry.guardians.push({
          id: link.guardian.id,
          name: `${link.guardian.firstName} ${link.guardian.lastName}`,
        });
        byChild.set(link.child.id, entry);
      }
      return [...byChild.values()];
    });
  }

  /**
   * Record that an adult may collect a child. Without this the pickup check in
   * `checkInChild` can never pass, so the desk could not work from the app alone.
   */
  async setGuardian(user: AuthUser, input: { childId: string; guardianId: string; relation?: string }, ip?: string) {
    if (input.childId === input.guardianId) throw new BadRequestException('a child cannot be their own guardian');
    const [child, guardian] = await this.tenant.run(user, (tx) =>
      Promise.all([
        tx.member.findFirst({ where: { id: input.childId, churchId: user.churchId, deletedAt: null } }),
        tx.member.findFirst({ where: { id: input.guardianId, churchId: user.churchId, deletedAt: null } }),
      ]),
    );
    if (!child) throw new BadRequestException('that child is not in this church');
    if (!guardian) throw new BadRequestException('that guardian is not in this church');

    return this.tenant.run(user, async (tx) => {
      const row = await tx.memberGuardian.upsert({
        where: { childId_guardianId: { childId: input.childId, guardianId: input.guardianId } },
        create: {
          childId: input.childId,
          guardianId: input.guardianId,
          relation: input.relation || 'Parent',
          canPickup: true,
        },
        update: { relation: input.relation || 'Parent', canPickup: true },
      });
      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: 'child.guardian',
        entity: 'MemberGuardian',
        entityId: `${input.childId}:${input.guardianId}`,
        after: { relation: row.relation, canPickup: true },
        ip,
      });
      return row;
    });
  }

  async checkOut(user: AuthUser, childId: string, serviceId: string, code: string, ip?: string) {
    const now = new Date();
    const { reply, outcome } = await this.tenant.run(user, async (tx) => {
      await this.assertDeskChild(tx, user, childId);
      const row = await tx.childCheckIn.findFirst({
        where: { churchId: user.churchId, childId, serviceId, checkedOutAt: null },
      });
      if (!row) throw new BadRequestException('that child is not checked in right now');
      if (row.codeAttempts >= 5) throw new BadRequestException('too many wrong codes - check the child in again to reset it');
      const ok = createHash('sha256').update(code.trim()).digest('hex') === row.pickupCodeHash;
      if (!ok) {
        await tx.childCheckIn.update({ where: { id: row.id }, data: { codeAttempts: { increment: 1 } } });
        throw new BadRequestException('that pickup code is not right');
      }
      const child = await tx.member.findFirst({
        where: { id: childId, churchId: user.churchId },
        select: { firstName: true, lastName: true },
      });
      await tx.childCheckIn.update({
        where: { id: row.id },
        data: { checkedOutAt: now, checkedOutBy: row.guardianId },
      });
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: 'child.checkout', entity: 'ChildCheckIn', entityId: row.id, ip });
      const notice = await this.notifyGuardian(tx, user, {
        childName: child ? `${child.firstName} ${child.lastName}` : 'Your child',
        guardianId: row.guardianId,
        kind: 'OUT',
        at: now,
        idempotencyKey: `child-out:${row.id}:${Math.floor(now.getTime() / 60_000)}`,
      });
      return { reply: { checkedOut: true, sms: notice.view }, outcome: notice.outcome };
    });
    if (outcome) this.sms.flush(outcome);
    return reply;
  }
}

class ChildInDto {
  @IsString() serviceId!: string;
  @IsString() childId!: string;
  @IsString() guardianId!: string;
}

class GuardianDto {
  @IsString() childId!: string;
  @IsString() guardianId!: string;
  @IsOptional() @IsString() relation?: string;
}

class SkipsDto {
  @IsArray() @IsString({ each: true }) dates!: string[];
}

class RegisterDto {
  @IsString() date!: string;
  @IsArray() marks!: unknown[];
}

// Switched off in Settings → App sections means switched off here too.
@ForModule('children')
@Controller('children')
export class ChildrenController {
  constructor(private readonly svc: ChildrenService) {}

  @RequirePermissions('members:write')
  @Post('guardian')
  guardian(@Req() req: AuthedRequest, @Body() dto: GuardianDto) {
    return this.svc.setGuardian(req.user!, dto, req.ip);
  }

  /**
   * The desk writes. Three roles legitimately work it and no single permission
   * covers them all, so the route names the choice instead of opening to anyone
   * signed in: the office (members:write), the door team (checkin:write) and the
   * class teacher (children:write). deskMoveChildIds() is the second lock — it
   * narrows the teacher to their own class before anything is written.
   */
  @AnyPermission('members:write', 'checkin:write', 'children:write')
  @Post('checkin')
  checkIn(@Req() req: AuthedRequest, @Body() dto: ChildInDto) {
    return this.svc.checkInChild(req.user!, dto, req.ip);
  }

  /**
   * The desk list. Same shape as the two writes, but narrower: this is the one
   * that names the adults allowed to collect a child, so the door role does not
   * get it — only the office and the teacher's own class (deskRosterChildIds).
   */
  @AnyPermission('members:write', 'children:write')
  @Get('roster')
  roster(@Req() req: AuthedRequest) {
    return this.svc.roster(req.user!);
  }

  /**
   * The desk's service picker. It sits here rather than on GET /services so a
   * church that switched the Services section off can still run the children's
   * desk; the class-level @ForModule('children') is what guards it.
   */
  @RequirePermissions('services:read')
  @Get('services')
  deskServices(@Req() req: AuthedRequest) {
    return this.svc.deskServices(req.user!);
  }

  @RequirePermissions('services:read')
  @Get('active')
  active(@Req() req: AuthedRequest, @Query('serviceId') serviceId: string) {
    return this.svc.listActive(req.user!, serviceId);
  }

  /**
   * The Sundays marked off. Readable by every desk role so the teacher sees a
   * closed room; writable only by the office, the people who own the calendar.
   */
  @AnyPermission('members:write', 'checkin:write', 'children:write')
  @Get('skips')
  skips(@Req() req: AuthedRequest) {
    return this.svc.skips(req.user!);
  }

  @RequirePermissions('members:write')
  @Put('skips')
  saveSkips(@Req() req: AuthedRequest, @Body() dto: SkipsDto) {
    return this.svc.saveSkips(req.user!, dto.dates, req.ip);
  }

  /**
   * The class register. Open to the office and the class teacher; the service
   * narrows everyone to the class the office assigned, and refuses an account
   * with no class outright rather than showing the whole church.
   */
  @AnyPermission('members:write', 'children:write')
  @Get('register')
  register(@Req() req: AuthedRequest, @Query('date') date?: string) {
    return this.svc.register(req.user!, date);
  }

  @AnyPermission('members:write', 'children:write')
  @Put('register')
  saveRegister(@Req() req: AuthedRequest, @Body() dto: RegisterDto) {
    return this.svc.saveRegister(req.user!, dto, req.ip);
  }

  @AnyPermission('members:write', 'checkin:write', 'children:write')
  @Post('checkout')
  checkout(@Req() req: AuthedRequest, @Body() dto: { childId: string; serviceId: string; code: string }) {
    return this.svc.checkOut(req.user!, dto.childId, dto.serviceId, dto.code, req.ip);
  }
}



@Module({
  imports: [ServicesModule, SmsModule],
  providers: [TenantService, ChildrenService],
  controllers: [ChildrenController],
})
export class ChildrenModule {}
