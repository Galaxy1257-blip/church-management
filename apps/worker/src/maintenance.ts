// The maintenance job bodies, moved out of main.ts so the same code runs from
// the BullMQ consumer (always-on worker) and from the tick URL (free plan, where
// nothing is awake unless GitHub asks). Keep them idempotent: a tick that fires
// twice must not send twice — the per-day idempotency keys in each job do that.
import type { Queue } from 'bullmq';
import { reconcile } from './reconciler';

export interface MaintenanceQueues {
  smsSend: Queue;
  givingSettle: Queue;
  verifyPending: Queue;
}

export async function runMaintenance(name: string, queues: MaintenanceQueues): Promise<unknown> {
  switch (name) {
    case 'sweep-pending': {
      const { platformPrisma: prisma } = await import('@chms/db');
      const stale = await prisma.transaction.findMany({
        where: { status: { in: ['PENDING', 'PROCESSING'] }, createdAt: { lt: new Date(Date.now() - 30 * 60_000) } },
        select: { id: true },
        take: 500,
      });
      for (const t of stale) {
        await queues.verifyPending.add('verify', { txId: t.id }, { jobId: `verify:${t.id}:${Date.now()}` });
      }
      return { swept: stale.length };
    }
    case 'reconcile':
    case 'boot-reconcile': {
      return reconcile({
        smsSend: (logId) => {
          void queues.smsSend.add('send', { logId }, { jobId: `sms:${logId}:${Date.now()}` });
        },
        givingSettle: (txId) => {
          void queues.givingSettle.add('settle', { txId }, { jobId: `settle:${txId}:${Date.now()}` });
        },
        verifyPending: (txId) => {
          void queues.verifyPending.add('verify', { txId }, { jobId: `verify:${txId}:${Date.now()}` });
        },
      });
    }
    case 'followup-tick': {
      const { processFollowups } = await import('./followup');
      return processFollowups();
    }
    case 'verse-of-day': {
      const { sendVerseOfDay } = await import('./verse-of-day');
      return sendVerseOfDay();
    }
    case 'missing-member-scan': {
      const { scanMissingMembers } = await import('./missing-member');
      return scanMissingMembers();
    }
    case 'age-promotion': {
      // Birthday auto-upgrade for churches with demographics.autoPromote on.
      const { platformPrisma: pp, withTenant, appendAudit } = await import('@chms/db');
      const { promotionsFor } = await import('@chms/shared');
      const churches = await pp.church.findMany({ select: { id: true, settings: true } });
      let promoted = 0;
      for (const c of churches) {
        const demo = (c.settings as Record<string, unknown> | null)?.demographics as
          | { autoPromote?: boolean }
          | undefined ?? {};
        if (demo.autoPromote !== true) continue;
        await withTenant(c.id, null, async (tx) => {
          const rows = await tx.ageBracket.findMany({ where: { churchId: c.id } });
          const brackets = rows.map((b) => ({
            id: b.id,
            key: b.key,
            label: b.label,
            minAge: b.minAge,
            maxAge: b.maxAge,
            genderSplit: b.genderSplit,
            segmentKey: b.segmentKey,
            isActive: b.isActive,
            sortOrder: b.sortOrder,
          }));
          const members = await tx.member.findMany({
            where: { churchId: c.id, deletedAt: null, status: 'ACTIVE', dob: { not: null } },
            select: { id: true, firstName: true, lastName: true, ageBracketId: true, dob: true },
          });
          const promos = promotionsFor(
            members.map((m) => ({
              id: m.id,
              name: `${m.firstName} ${m.lastName}`,
              ageBracketId: m.ageBracketId,
              dob: m.dob,
            })),
            brackets,
          );
          for (const p of promos) {
            const target = brackets.find((b) => b.key === p.toBracketKey);
            if (!target) continue;
            await tx.member.update({ where: { id: p.id }, data: { ageBracketId: target.id } });
            await appendAudit(tx, {
              churchId: c.id,
              action: 'member.age_promotion.auto',
              entity: 'Member',
              entityId: p.id,
              before: { bracketKey: p.fromBracketKey },
              after: { bracketKey: p.toBracketKey, age: p.age },
            });
            promoted += 1;
          }
        });
      }
      return { promoted };
    }
    default:
      return { ignored: name };
  }
}
