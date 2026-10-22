// Finance: cash/cheque batches with the two-person rule — two different
// counters record a count, and an approver who is neither counter approves.
// Approval flips the batch's PENDING cash transactions to SUCCESS (that is
// when the money is "counted in"); the nightly reconciler cross-checks.
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { appendAudit } from '@chms/db';
import { PayChannel } from '@chms/shared';
import { TenantService } from '../common/tenant';
import { AuthUser } from '../common/guards';

export interface BatchEntryInput {
  fundId: string;
  amountMinor: number;
  /** CASH | CHEQUE | MOBILE_MONEY (manual MoMo transfer — reference required) */
  channel: 'CASH' | 'CHEQUE' | 'MOBILE_MONEY';
  /** Bank/cheque number or MoMo transaction reference (required for cheque/MoMo). */
  bankRef?: string;
  giverName?: string;
}

@Injectable()
export class FinanceService {
  constructor(private readonly tenant: TenantService) {}

  listBatches(user: AuthUser) {
    return this.tenant.run(user, (tx) =>
      tx.givingBatch.findMany({
        where: { churchId: user.churchId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    );
  }

  createBatch(user: AuthUser, input: { serviceId: string; label: string }, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const service = await tx.service.findFirst({
        where: { id: input.serviceId, churchId: user.churchId },
      });
      if (!service) throw new NotFoundException('service not found');
      const batch = await tx.givingBatch.create({
        data: {
          churchId: user.churchId,
          branchId: service.branchId,
          serviceId: input.serviceId,
          label: input.label,
          status: 'OPEN',
        },
      });
      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: 'finance.batch.create',
        entity: 'GivingBatch',
        entityId: batch.id,
        after: batch,
        ip,
      });
      return batch;
    });
  }

  addEntries(user: AuthUser, batchId: string, entries: BatchEntryInput[], ip?: string) {
    if (!Array.isArray(entries) || entries.length === 0) throw new BadRequestException('no entries');
    return this.tenant.run(user, async (tx) => {
      const batch = await tx.givingBatch.findFirst({ where: { id: batchId, churchId: user.churchId } });
      if (!batch) throw new NotFoundException('batch not found');
      if (batch.status !== 'OPEN') throw new BadRequestException('batch is no longer open for entries');

      const created: any[] = [];
      for (const e of entries) {
        if (!Number.isInteger(e.amountMinor) || e.amountMinor <= 0) {
          throw new BadRequestException('amountMinor must be a positive integer');
        }
        if ((e.channel === 'CHEQUE' || e.channel === 'MOBILE_MONEY') && !e.bankRef?.trim()) {
          throw new BadRequestException(`${e.channel === 'CHEQUE' ? 'Cheque number' : 'MoMo transaction reference'} is required`);
        }
        const channel: PayChannel =
          e.channel === 'CHEQUE' ? 'CHEQUE' : e.channel === 'MOBILE_MONEY' ? 'MOBILE_MONEY' : 'CASH';
        const row = await tx.transaction.create({
          data: {
            churchId: user.churchId,
            branchId: batch.branchId,
            fundId: e.fundId,
            giverName: e.giverName?.trim() || null,
            giftMinor: e.amountMinor,
            feeCoverMinor: 0,
            chargedMinor: e.amountMinor,
            currency: 'GHS',
            channel,
            status: 'PENDING',
            reference: `cash_${batchId}_${Date.now()}_${created.length}`,
            recordedBy: user.userId,
            batchId: batch.id,
            bankRef: e.bankRef?.trim() || null,
          },
        });
        created.push(row);
      }
      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: 'finance.batch.entries.add',
        entity: 'GivingBatch',
        entityId: batchId,
        after: { added: created.length },
        ip,
      });
      return created;
    });
  }
  /** First counter records the counted total; a second distinct counter confirms. */
  recordCount(user: AuthUser, batchId: string, countedMinor: number, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const batch = await tx.givingBatch.findFirst({ where: { id: batchId, churchId: user.churchId } });
      if (!batch) throw new NotFoundException('batch not found');
      if (batch.status !== 'OPEN' && batch.status !== 'COUNTED') {
        throw new BadRequestException('batch cannot be recounted');
      }
      if (!Number.isInteger(countedMinor) || countedMinor < 0) {
        throw new BadRequestException('countedMinor must be a non-negative integer');
      }

      if (!batch.countedBy1) {
        await tx.givingBatch.update({
          where: { id: batchId },
          data: { countedBy1: user.userId, countedMinor },
        });
        return { countedBy: 1, status: 'OPEN' as const, countedMinor };
      }
      if (batch.countedBy1 === user.userId) {
        throw new ForbiddenException('a second person must count (two-counter rule)');
      }
      if (batch.countedMinor !== null && batch.countedMinor !== countedMinor) {
        throw new BadRequestException(
          `count mismatch: first counter recorded ${batch.countedMinor}, you recorded ${countedMinor}. Resolve before approving.`,
        );
      }
      const updated = await tx.givingBatch.update({
        where: { id: batchId },
        data: { countedBy2: user.userId, countedMinor, status: 'COUNTED' },
      });
      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: 'finance.batch.counted',
        entity: 'GivingBatch',
        entityId: batchId,
        after: { countedMinor, countedBy1: batch.countedBy1, countedBy2: user.userId },
        ip,
      });
      return { countedBy: 2, status: updated.status, countedMinor };
    });
  }

  /** Approver must be neither counter. Marks the batch's cash txs SUCCESS. */
  approve(user: AuthUser, batchId: string, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const batch = await tx.givingBatch.findFirst({ where: { id: batchId, churchId: user.churchId } });
      if (!batch) throw new NotFoundException('batch not found');
      if (batch.status !== 'COUNTED') throw new BadRequestException('batch must be counted by two people first');
      if (batch.countedBy1 === user.userId || batch.countedBy2 === user.userId) {
        throw new ForbiddenException('approver must be someone other than the two counters');
      }
      const updated = await tx.givingBatch.update({
        where: { id: batchId },
        data: { status: 'APPROVED', approvedBy: user.userId },
      });
      await tx.transaction.updateMany({
        where: { batchId, status: 'PENDING' },
        data: { status: 'SUCCESS', paidAt: new Date() },
      });
      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: 'finance.batch.approve',
        entity: 'GivingBatch',
        entityId: batchId,
        before: { status: batch.status },
        after: { status: updated.status, countedMinor: batch.countedMinor },
        ip,
      });
      return updated;
    });
  }
  deposit(user: AuthUser, batchId: string, depositRef: string, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const batch = await tx.givingBatch.findFirst({ where: { id: batchId, churchId: user.churchId } });
      if (!batch) throw new NotFoundException('batch not found');
      if (batch.status !== 'APPROVED') throw new BadRequestException('batch must be approved before deposit');
      const updated = await tx.givingBatch.update({
        where: { id: batchId },
        data: { status: 'DEPOSITED', depositRef, depositedAt: new Date() },
      });
      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: 'finance.batch.deposit',
        entity: 'GivingBatch',
        entityId: batchId,
        after: { depositRef },
        ip,
      });
      return updated;
    });
  }

  byFund(user: AuthUser, from?: string, to?: string) {
    return this.tenant.run(user, async (tx) => {
      const rows = await tx.$queryRaw<{ fundname: string; total: bigint; count: bigint }[]>`
        SELECT f.name AS fundname, COALESCE(SUM(t."giftMinor"),0) AS total, COUNT(t.id) AS count
        FROM "Fund" f
        LEFT JOIN "Transaction" t
          ON t."fundId" = f.id
         AND t.status = 'SUCCESS'
         AND t."paidAt" IS NOT NULL
         AND (${from ?? null}::timestamptz IS NULL OR t."paidAt" >= ${from ?? null}::timestamptz)
         AND (${to ?? null}::timestamptz IS NULL OR t."paidAt" <= ${to ?? null}::timestamptz)
        WHERE f."churchId" = ${user.churchId}::uuid AND f."isActive" = true
        GROUP BY f.id, f.name
        ORDER BY total DESC`;
      return rows.map((r) => ({ fund: r.fundname, totalMinor: Number(r.total), count: Number(r.count) }));
    });
  }

  bySunday(user: AuthUser, from?: string, to?: string) {
    return this.tenant.run(user, async (tx) => {
      const rows = await tx.$queryRaw<{ day: Date; total: bigint; count: bigint }[]>`
        SELECT date_trunc('day', t."paidAt") AS day, SUM(t."giftMinor") AS total, COUNT(t.id) AS count
        FROM "Transaction" t
        WHERE t."churchId" = ${user.churchId}::uuid
          AND t.status = 'SUCCESS'
          AND t."paidAt" IS NOT NULL
          AND (${from ?? null}::timestamptz IS NULL OR t."paidAt" >= ${from ?? null}::timestamptz)
          AND (${to ?? null}::timestamptz IS NULL OR t."paidAt" <= ${to ?? null}::timestamptz)
        GROUP BY 1
        ORDER BY 1 DESC
        LIMIT 52`;
      return rows.map((r) => ({ date: r.day, totalMinor: Number(r.total), count: Number(r.count) }));
    });
  }

  /** Giving analytics: daily trend, channel mix, top (non-anonymous) givers. */
  analytics(user: AuthUser, days = 90) {
    return this.tenant.run(user, async (tx) => {
      const since = new Date(Date.now() - days * 86400_000);
      const daily = await tx.$queryRaw<{ day: Date; total: bigint; count: bigint }[]>`
        SELECT date_trunc('day', "paidAt") AS day, SUM("giftMinor") AS total, COUNT(id) AS count
        FROM "Transaction"
        WHERE "churchId" = ${user.churchId}::uuid AND status = 'SUCCESS' AND "paidAt" >= ${since}
        GROUP BY 1 ORDER BY 1`;
      const channels = await tx.transaction.groupBy({
        by: ['channel'],
        where: { churchId: user.churchId, status: 'SUCCESS', paidAt: { gte: since } },
        _sum: { giftMinor: true },
        _count: { _all: true },
      });
      const top = await tx.transaction.groupBy({
        by: ['memberId'],
        where: { churchId: user.churchId, status: 'SUCCESS', paidAt: { gte: since }, memberId: { not: null }, isAnonymous: false },
        _sum: { giftMinor: true },
        orderBy: { _sum: { giftMinor: 'desc' } },
        take: 10,
      });
      return {
        days,
        daily: daily.map((r) => ({ date: r.day, totalMinor: Number(r.total), count: Number(r.count) })),
        channels: channels.map((c) => ({ channel: c.channel, totalMinor: c._sum.giftMinor ?? 0, count: c._count._all })),
        topMembers: top.map((t) => ({ memberId: t.memberId, totalMinor: t._sum.giftMinor ?? 0 })),
      };
    });
  }
}
