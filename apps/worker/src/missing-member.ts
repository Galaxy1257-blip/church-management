// R4.1 missing-member alerts: nightly scan — active members with NO attendance
// in the last N Sundays (default 3) who HAD attended before the window.
// Creates an open CareTask per lapsed member + one SMS digest to the welfare
// team numbers in Church.settings.care. Idempotent: skips members with an open
// MISSING_MEMBER task; digest deduped per day by SMS idempotency key.
import { withTenant, platformPrisma as prisma } from '@chms/db';
import { Logger } from './log';
import { enqueueSms } from './followup';

const log = new Logger('MissingMember');

interface CareSettings {
  enabled?: boolean;
  missingSundays?: number;
  digestPhones?: string[];
}

function lastSundays(n: number, now: Date): Date[] {
  const out: Date[] = [];
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  cursor.setUTCDate(cursor.getUTCDate() - cursor.getUTCDay()); // back to Sunday (today counts)
  for (let i = 0; i < n; i++) {
    out.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() - 7);
  }
  return out; // descending (newest first)
}

function dayKey(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

export async function scanMissingMembers(now = new Date()): Promise<{
  churches: number;
  flagged: number;
  tasksCreated: number;
  digestsSent: number;
}> {
  const churches = await prisma.church.findMany({ select: { id: true, name: true, settings: true } });
  let flagged = 0;
  let tasksCreated = 0;
  let digestsSent = 0;

  for (const church of churches) {
    try {
      const care = ((church.settings ?? {}) as any).care as CareSettings | undefined;
      if (care?.enabled === false) continue;
      const n = Math.min(12, Math.max(1, care?.missingSundays ?? 3));
      const digestPhones = (care?.digestPhones ?? []).filter((p) => typeof p === 'string' && p.length >= 9);

      const sundays = lastSundays(n, now);
      const windowStart = sundays[sundays.length - 1]; // oldest Sunday 00:00 UTC
      const windowEnd = new Date(windowStart.getTime() + n * 7 * 86400_000);

      const members = await prisma.member.findMany({
        where: { churchId: church.id, deletedAt: null, status: 'ACTIVE', createdAt: { lt: windowStart } },
        select: { id: true, firstName: true, lastName: true },
        take: 20_000,
      });
      if (members.length === 0) continue;
      const ids = new Set(members.map((m) => m.id));

      // Attendance inside the window (mapped to its calendar Sunday) + prior history.
      const windowRows = await prisma.attendance.findMany({
        where: { churchId: church.id, memberId: { in: [...ids] }, checkedInAt: { gte: windowStart, lt: windowEnd } },
        select: { memberId: true, checkedInAt: true },
        take: 100_000,
      });
      const everBefore = new Set(
        (
          await prisma.attendance.findMany({
            where: { churchId: church.id, memberId: { in: [...ids] }, checkedInAt: { lt: windowStart } },
            select: { memberId: true },
            take: 100_000,
          })
        ).map((r) => r.memberId),
      );
      const attendedSundays = new Map<string, Set<string>>();
      for (const r of windowRows) {
        if (!r.memberId) continue;
        const d = new Date(r.checkedInAt);
        const sunday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
        sunday.setUTCDate(sunday.getUTCDate() - sunday.getUTCDay());
        if (!attendedSundays.has(r.memberId)) attendedSundays.set(r.memberId, new Set());
        attendedSundays.get(r.memberId)!.add(dayKey(sunday));
      }

      const lapsed: { id: string; firstName: string; lastName: string }[] = [];
      for (const m of members) {
        if (!everBefore.has(m.id)) continue; // never attended before window — churn list covers these
        const seen = attendedSundays.get(m.id);
        if (seen && seen.size > 0) continue; // attended at least one Sunday in the window
        lapsed.push(m);
      }
      if (lapsed.length === 0) continue;
      flagged += lapsed.length;

      const open = await prisma.careTask.findMany({
        where: { churchId: church.id, type: 'MISSING_MEMBER', status: { in: ['OPEN', 'IN_PROGRESS'] } },
        select: { memberId: true },
      });
      const already = new Set(open.map((t) => t.memberId).filter(Boolean));
      for (const m of lapsed) {
        if (already.has(m.id)) continue;
        await withTenant(church.id, null, async (tx) => {
          await tx.careTask.create({
            data: {
              churchId: church.id,
              memberId: m.id,
              type: 'MISSING_MEMBER',
              dueAt: new Date(now.getTime() + 3 * 86400_000),
              note: `${m.firstName} ${m.lastName} — no attendance in the last ${n} Sundays (since ${dayKey(windowStart)})`,
            },
          });
        });
        tasksCreated++;
      }

      if (digestPhones.length > 0 && lapsed.length > 0) {
        const body =
          `[${church.name}] Missing-member alert: ${lapsed.length} member(s) missed the last ${n} ` +
          `Sundays. Review the care queue and assign follow-up calls.`;
        for (const phone of digestPhones) {
          const ok = await enqueueSms(church.id, phone, body, `missing:${church.id}:${dayKey(now)}`);
          if (ok) digestsSent++;
        }
      }
    } catch (err) {
      log.error(`church=${church.id}: ${String(err)}`);
    }
  }
  return { churches: churches.length, flagged, tasksCreated, digestsSent };
}

