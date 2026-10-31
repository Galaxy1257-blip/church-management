// Services: Sunday service instances (from templates), open/close lifecycle.
// The worker materialises template instances ahead of time; this module also
// allows manual creation (joint services, special events) and manages the
// church's automatic weekly window (default Sunday 07:30–12:00) so check-in
// opens and closes without anyone pressing Start.
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { appendAudit, Db } from '@chms/db';
import {
  isDateKey,
  isValidHhMm,
  minutesSinceMidnight,
  resolveServiceSchedule,
  serviceWindowState,
  ServiceStatus,
  type ServiceSchedule,
} from '@chms/shared';
import { TenantService } from '../common/tenant';
import { AuthUser } from '../common/guards';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface ChurchClock {
  zone: string;
  now: DateTime;
}

@Injectable()
export class ServicesService {
  constructor(private readonly tenant: TenantService) {}

  private clock(timezone: string | null | undefined): ChurchClock {
    const zone = timezone || 'Africa/Accra';
    const now = DateTime.now().setZone(zone);
    return { zone, now: now.isValid ? now : DateTime.now().setZone('Africa/Accra') };
  }

  /** 0 = Sunday, matching the shared schedule model (Luxon uses 7 for Sunday). */
  private localWeekday(now: DateTime): number {
    return now.weekday % 7;
  }

  private async churchSchedule(tx: Db, churchId: string): Promise<{
    schedule: ServiceSchedule;
    clock: ChurchClock;
    settings: Record<string, unknown>;
  }> {
    const church = await tx.church.findUnique({ where: { id: churchId }, select: { timezone: true, settings: true } });
    const settings = (church?.settings ?? {}) as Record<string, unknown>;
    return { schedule: resolveServiceSchedule(settings), clock: this.clock(church?.timezone), settings };
  }

  /**
   * Keep today's service in step with the weekly window. Called on every read
   * of the list (dashboard, check-in, services), so no scheduler is needed:
   * the first person in on Sunday morning opens check-in, and the first read
   * after 12:00 closes it.
   */
  private async syncScheduledService(tx: Db, churchId: string): Promise<void> {
    const { schedule, clock } = await this.churchSchedule(tx, churchId);
    if (!schedule.enabled) return;
    const { now } = clock;
    const state = serviceWindowState({
      schedule,
      weekday: this.localWeekday(now),
      timeHhMm: now.toFormat('HH:mm'),
      dateKey: now.toFormat('yyyy-MM-dd'),
    });
    if (state === 'off') return;

    const dayStart = now.startOf('day');
    const today = await tx.service.findFirst({
      where: { churchId, startsAt: { gte: dayStart.toJSDate(), lt: dayStart.plus({ days: 1 }).toJSDate() } },
      orderBy: { startsAt: 'asc' },
    });
    const windowStart = dayStart
      .set({ hour: Number(schedule.startTime.slice(0, 2)), minute: Number(schedule.startTime.slice(3, 5)) })
      .toJSDate();

    if (state === 'skipped') {
      // No church today: close the Sunday service so nobody checks into it.
      if (today && today.name === schedule.name && today.status !== 'CLOSED') {
        await tx.service.update({ where: { id: today.id }, data: { status: 'CLOSED', closedAt: new Date() } });
      }
      return;
    }

    if (!today) {
      await tx.service.create({
        data: {
          churchId,
          name: schedule.name,
          startsAt: windowStart,
          status: state === 'open' ? 'OPEN' : 'SCHEDULED',
        },
      });
      return;
    }

    if (state === 'open' && today.status === 'SCHEDULED') {
      // Template rows can carry a different start time; the window wins so the
      // list and check-in agree on when church starts.
      await tx.service.update({ where: { id: today.id }, data: { status: 'OPEN', startsAt: windowStart } });
      return;
    }

    if (state === 'after' && today.status === 'OPEN' && today.name === schedule.name) {
      await tx.service.update({ where: { id: today.id }, data: { status: 'CLOSED', closedAt: new Date() } });
    }
  }

  list(user: AuthUser, opts: { from?: string; to?: string } = {}) {
    return this.tenant.run(user, async (tx) => {
      await this.syncScheduledService(tx, user.churchId);
      const where: Record<string, unknown> = { churchId: user.churchId };
      if (opts.from || opts.to) {
        where.startsAt = {
          ...(opts.from ? { gte: new Date(opts.from) } : {}),
          ...(opts.to ? { lte: new Date(opts.to) } : {}),
        };
      }
      return tx.service.findMany({ where, orderBy: { startsAt: 'desc' }, take: 200 });
    });
  }

  /** The automatic window plus the next Sundays, for the Services screen. */
  schedule(user: AuthUser) {
    return this.tenant.run(user, async (tx) => {
      const { schedule, clock } = await this.churchSchedule(tx, user.churchId);
      return { ...schedule, timezone: clock.zone, upcoming: this.upcomingSundays(schedule, clock.now) };
    });
  }

  private upcomingSundays(schedule: ServiceSchedule, now: DateTime) {
    const days: { date: string; label: string; skipped: boolean }[] = [];
    const start = now.startOf('day');
    for (let offset = 0; days.length < 8 && offset < 70; offset += 1) {
      const day = start.plus({ days: offset });
      if (this.localWeekday(day) !== schedule.weekday) continue;
      const date = day.toFormat('yyyy-MM-dd');
      days.push({
        date,
        label: `${WEEKDAY_LABELS[schedule.weekday]} ${day.toFormat('d LLL')}`,
        skipped: schedule.skipDates.includes(date),
      });
    }
    return days;
  }

  saveSchedule(
    user: AuthUser,
    input: {
      enabled: boolean;
      weekday: number;
      startTime: string;
      endTime: string;
      name: string;
      skipDates?: string[];
    },
    ip?: string,
  ) {
    if (!Number.isInteger(input.weekday) || input.weekday < 0 || input.weekday > 6) {
      throw new BadRequestException('Pick a day of the week.');
    }
    if (!isValidHhMm(input.startTime) || !isValidHhMm(input.endTime)) {
      throw new BadRequestException('Times must look like 07:30.');
    }
    if (minutesSinceMidnight(input.endTime) <= minutesSinceMidnight(input.startTime)) {
      throw new BadRequestException('The closing time must be after the opening time.');
    }
    const name = input.name.trim();
    if (!name) throw new BadRequestException('Give the service a name.');

    const skipDates = [...new Set((input.skipDates ?? []).filter(isDateKey))].sort();
    const schedule: ServiceSchedule = {
      enabled: input.enabled,
      weekday: input.weekday,
      startTime: input.startTime,
      endTime: input.endTime,
      name: name.slice(0, 60),
      skipDates,
    };

    return this.tenant.run(user, async (tx) => {
      const { settings, clock } = await this.churchSchedule(tx, user.churchId);
      await tx.church.update({
        where: { id: user.churchId },
        data: { settings: { ...settings, serviceSchedule: schedule } as any },
      });
      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: 'service.schedule.save',
        entity: 'Church',
        entityId: user.churchId,
        after: schedule,
        ip,
      });
      await this.syncScheduledService(tx, user.churchId);
      return { ...schedule, timezone: clock.zone, upcoming: this.upcomingSundays(schedule, clock.now) };
    });
  }


  getOne(user: AuthUser, id: string) {
    return this.tenant.run(user, async (tx) => {
      const svc = await tx.service.findFirst({ where: { id, churchId: user.churchId } });
      if (!svc) throw new NotFoundException('service not found');
      return svc;
    });
  }

  create(
    user: AuthUser,
    input: { name: string; startsAt: string; branchId?: string; templateId?: string },
    ip?: string,
  ) {
    return this.tenant.run(user, async (tx) => {
      const svc = await tx.service.create({
        data: {
          churchId: user.churchId,
          branchId: input.branchId ?? null,
          templateId: input.templateId ?? null,
          name: input.name,
          startsAt: new Date(input.startsAt),
          status: 'SCHEDULED',
        },
      });
      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: 'service.create',
        entity: 'Service',
        entityId: svc.id,
        after: svc,
        ip,
      });
      return svc;
    });
  }

  setStatus(user: AuthUser, id: string, status: ServiceStatus, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const svc = await tx.service.findFirst({ where: { id, churchId: user.churchId } });
      if (!svc) throw new NotFoundException('service not found');
      if (svc.status === 'CLOSED' && status !== 'CLOSED') {
        throw new BadRequestException('a closed service cannot be reopened');
      }
      const updated = await tx.service.update({
        where: { id },
        data: { status, closedAt: status === 'CLOSED' ? new Date() : null },
      });
      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: `service.${status.toLowerCase()}`,
        entity: 'Service',
        entityId: id,
        before: { status: svc.status },
        after: { status: updated.status },
        ip,
      });
      return updated;
    });
  }

  templates(user: AuthUser) {
    return this.tenant.run(user, (tx) =>
      tx.serviceTemplate.findMany({ where: { churchId: user.churchId }, orderBy: { name: 'asc' } }),
    );
  }
}
