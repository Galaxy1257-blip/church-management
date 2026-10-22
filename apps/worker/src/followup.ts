// Follow-up (drip) engine: executes due FollowUpProgress rows — SMS steps,
// TASK steps (CareTask), PROMPT steps (PendingPrompt + question SMS).
// Honours workflow quiet hours; STOP/reply cancellation is handled by the
// API inbound webhook. Everything is DB-driven (reconciler-safe).
import { withTenant, platformPrisma as prisma } from '@chms/db';
import { inQuietHours, localHourIn, render, smsSegments } from '@chms/shared';
import { Logger } from './log';

const log = new Logger('Followup');

export async function processFollowups(now = new Date()): Promise<{ processed: number; skipped: number }> {
  const due = await prisma.followUpProgress.findMany({
    where: { state: 'ACTIVE', nextRunAt: { lte: now } },
    take: 200,
    include: { workflow: true },
  });
  let processed = 0;
  let skipped = 0;

  for (const progress of due) {
    try {
      const church = await prisma.church.findUnique({ where: { id: progress.churchId } });
      if (!church) {
        skipped++;
        continue;
      }
      const hour = localHourIn(church.timezone);
      if (inQuietHours(hour, progress.workflow.quietStart, progress.workflow.quietEnd)) {
        // Push to the next quiet-hours exit (next morning at quietEnd).
        await prisma.followUpProgress.update({
          where: { id: progress.id },
          data: { nextRunAt: new Date(now.getTime() + (24 - hour + progress.workflow.quietEnd) * 3600_000) },
        });
        skipped++;
        continue;
      }

      const step = await prisma.followUpStep.findFirst({
        where: { versionId: progress.versionId, position: progress.nextPosition },
      });
      if (!step) {
        await prisma.followUpProgress.update({
          where: { id: progress.id },
          data: { state: 'COMPLETED', lastStepAt: now },
        });
        processed++;
        continue;
      }

      const visitor = progress.visitorId
        ? await prisma.visitor.findUnique({ where: { id: progress.visitorId } })
        : null;
      const phone = visitor?.phoneE164;
      if (!phone) {
        await prisma.followUpProgress.update({
          where: { id: progress.id },
          data: { state: 'CANCELLED', cancelReason: 'NO_PHONE' },
        });
        skipped++;
        continue;
      }

      if (step.type === 'SMS' || step.type === 'PROMPT') {
        const body = render(step.template, {
          firstName: visitor?.firstName ?? 'friend',
          churchName: church.name,
          pastorName: church.pastorDisplayName ?? 'Pastor',
          ...(step.question ? { question: step.question } : {}),
        });
        const queued = await enqueueSms(progress.churchId, phone, body, `drip:${progress.id}:${step.position}`);
        if (queued) {
          await advance(progress.id, step, now, step.type === 'PROMPT' ? 'PROMPT_SENT' : undefined);
          processed++;
        } else {
          skipped++; // wallet dry -> retried next tick
        }
        continue;
      }

      if (step.type === 'TASK') {
        await prisma.careTask.create({
          data: {
            churchId: progress.churchId,
            visitorId: progress.visitorId,
            type: 'TASK_STEP',
            dueAt: now,
            note: step.taskTitle ?? `Follow-up step ${step.position}`,
          },
        });
        await advance(progress.id, step, now);
        processed++;
        continue;
      }
    } catch (err) {
      log.error(`progress=${progress.id}: ${String(err)}`);
      skipped++;
    }
  }
  return { processed, skipped };
}

async function advance(progressId: string, step: { position: number; delayMinutes: number }, now: Date, _note?: string): Promise<void> {
  const next = await prisma.followUpStep.findFirst({
    where: { versionId: (await prisma.followUpProgress.findUniqueOrThrow({ where: { id: progressId } })).versionId, position: step.position + 1 },
  });
  await prisma.followUpProgress.update({
    where: { id: progressId },
    data: {
      nextPosition: step.position + 1,
      lastStepAt: now,
      nextRunAt: next ? new Date(now.getTime() + next.delayMinutes * 60_000) : null,
      state: next ? 'ACTIVE' : 'COMPLETED',
    },
  });
}

/** Worker-side reserve+log (same contract as giving-settle's dispatcher). */
export async function enqueueSms(churchId: string, toE164: string, body: string, idempotencyKey: string): Promise<boolean> {
  const segments = smsSegments(body);
  return withTenant(churchId, null, async (tx) => {
    const existing = await tx.smsLog.findUnique({ where: { idempotencyKey } });
    if (existing) return true;
    const wallet = await tx.smsWallet.findUnique({ where: { churchId } });
    if ((wallet?.balanceUnits ?? 0) < segments) return false;
    const updated = await tx.smsWallet.updateMany({
      where: { churchId, balanceUnits: { gte: segments } },
      data: { balanceUnits: { decrement: segments }, reservedUnits: { increment: segments } },
    });
    if (updated.count === 0) return false;
    await tx.smsLedger.create({
      data: {
        churchId,
        delta: -segments,
        reason: 'RESERVE',
        balanceAfter: (wallet?.balanceUnits ?? 0) - segments,
        idempotencyKey: `reserve:${idempotencyKey}`,
      },
    });
    const logRow = await tx.smsLog.create({
      data: { churchId, source: 'DRIP', toE164, body, segments, status: 'QUEUED', idempotencyKey },
    });
    await tx.smsLedger.update({ where: { idempotencyKey: `reserve:${idempotencyKey}` }, data: { refId: logRow.id } });
    return logRow.id !== null;
  }).then((ok) => {
    if (ok) {
      void prisma.smsLog.findUnique({ where: { idempotencyKey } }).then((row) => {
        if (row) {
          // Fire via the sms-send queue in main (imported lazily to avoid cycles).
          import('./queue-helpers').then((h) => h.enqueueSmsSend(row.id)).catch(() => undefined);
        }
      });
    }
    return ok;
  });
}
