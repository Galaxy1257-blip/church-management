// Offline-first headcount: the usher's device keeps a Dexie/IndexedDB outbox
// of delta events with client-generated uuidv7 ids. /sync/batch replays them;
// the Headcount.id PK makes replay idempotent (a resent batch is a no-op).
// Additive delta ledger: each event is +1 or -1 per segment (CHECK in SQL).
import { BadRequestException, Injectable } from '@nestjs/common';
import { Db } from '@chms/db';
import { appendAudit } from '@chms/db';
import { isUuid } from '@chms/shared';
import { TenantService } from '../common/tenant';
import { AuthUser } from '../common/guards';

export interface SyncEvent {
  id: string; // client-generated uuidv7 — doubles as idempotency key
  serviceId: string;
  segmentKey: string;
  delta: number; // +1 | -1
  deviceId: string;
  clientSeq: number;
  recordedAt: string; // ISO
}

export interface SyncResult {
  applied: number;
  skipped: { id: string; reason: string }[];
  totals: { segmentKey: string; label: string; net: number }[];
  netTotal: number;
}

@Injectable()
export class HeadcountService {
  constructor(private readonly tenant: TenantService) {}

  async syncBatch(user: AuthUser, deviceId: string, events: SyncEvent[], ip?: string): Promise<SyncResult> {
    if (!Array.isArray(events) || events.length === 0) throw new BadRequestException('no events');
    if (events.length > 1000) throw new BadRequestException('batch limited to 1000 events');

    const result = await this.tenant.run(user, async (tx) => {
      const skipped: { id: string; reason: string }[] = [];
      let applied = 0;

      // Resolve service + segments once per batch.
      const serviceIds = [...new Set(events.map((e) => e.serviceId))];
      const services = await tx.service.findMany({
        where: { id: { in: serviceIds }, churchId: user.churchId },
        select: { id: true, status: true },
      });
      const serviceById = new Map(services.map((s) => [s.id, s]));
      const segments = await tx.headcountSegment.findMany({
        where: { churchId: user.churchId, isActive: true },
      });
      const segmentByKey = new Map(segments.map((s) => [s.key, s]));

      for (const ev of events) {
        if (!isUuid(ev.id)) {
          skipped.push({ id: ev.id, reason: 'id is not a uuid' });
          continue;
        }
        if (ev.delta !== 1 && ev.delta !== -1) {
          skipped.push({ id: ev.id, reason: 'delta must be +1 or -1' });
          continue;
        }
        const service = serviceById.get(ev.serviceId);
        if (!service) {
          skipped.push({ id: ev.id, reason: 'service not found' });
          continue;
        }
        if (service.status === 'CLOSED') {
          skipped.push({ id: ev.id, reason: 'service is closed' });
          continue;
        }
        const segment = segmentByKey.get(ev.segmentKey);
        if (!segment) {
          skipped.push({ id: ev.id, reason: `unknown segment ${ev.segmentKey}` });
          continue;
        }

        // PG savepoint per event: a failed statement poisons the whole
        // interactive transaction (25P02), so catch-and-continue without one
        // breaks replay idempotency — any offline outbox replay used to crash.
        await tx.$executeRaw`SAVEPOINT hc_event`;
        try {
          await tx.headcount.create({
            data: {
              id: ev.id, // client-generated; PK = idempotency
              churchId: user.churchId,
              serviceId: ev.serviceId,
              segmentId: segment.id,
              delta: ev.delta,
              deviceId: ev.deviceId || deviceId,
              clientSeq: ev.clientSeq,
              recordedBy: user.userId,
              recordedAt: new Date(ev.recordedAt),
            },
          });
          await tx.$executeRaw`RELEASE SAVEPOINT hc_event`;
          applied += 1;
        } catch (e) {
          await tx.$executeRaw`ROLLBACK TO SAVEPOINT hc_event`;
          // Duplicate PK = already synced (replay). Confirm after savepoint
          // recovery; any other failure (RLS, FK…) must still propagate.
          const existing = await tx.headcount.findUnique({
            where: { id: ev.id },
            select: { id: true },
          });
          if (!existing) throw e;
        }
      }

      const totals = await this.totalsInTx(tx, user.churchId, null);
      if (applied > 0) {
        await appendAudit(tx, {
          churchId: user.churchId,
          actorId: user.userId,
          action: 'headcount.sync',
          entity: 'Headcount',
          after: { deviceId, applied, skipped: skipped.length },
          ip,
        });
      }
      return { applied, skipped, ...totals };
    });
    return result;
  }

  private async totalsInTx(
    tx: Db,
    churchId: string,
    serviceId: string | null,
  ): Promise<{ totals: { segmentKey: string; label: string; net: number }[]; netTotal: number }> {
    const segments = await tx.headcountSegment.findMany({
      where: { churchId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    const grouped = await tx.headcount.groupBy({
      by: ['segmentId', 'delta'],
      where: serviceId ? { churchId, serviceId } : { churchId },
      _sum: { delta: true },
    });
    const netBySegment = new Map<string, number>();
    for (const g of grouped) {
      netBySegment.set(g.segmentId, (netBySegment.get(g.segmentId) ?? 0) + (g._sum.delta ?? 0));
    }
    const totals = segments.map((s) => ({
      segmentKey: s.key,
      label: s.label,
      net: netBySegment.get(s.id) ?? 0,
    }));
    return { totals, netTotal: totals.reduce((a, t) => a + t.net, 0) };
  }

  totals(user: AuthUser, serviceId: string) {
    return this.tenant.run(user, (tx) => this.totalsInTx(tx, user.churchId, serviceId));
  }

  recent(user: AuthUser, serviceId: string, limit = 50) {
    return this.tenant.run(user, (tx) =>
      tx.headcount.findMany({
        where: { churchId: user.churchId, serviceId },
        orderBy: { syncedAt: 'desc' },
        take: Math.min(200, limit),
      }),
    );
  }

  /** Platform-scope totals for the public SSE stream (wall display). */
  async totalsPlatform(churchId: string, serviceId: string) {
    const { platformPrisma } = await import('@chms/db');
    const segments = await platformPrisma.headcountSegment.findMany({
      where: { churchId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    const grouped = await platformPrisma.headcount.groupBy({
      by: ['segmentId', 'delta'],
      where: { churchId, serviceId },
      _sum: { delta: true },
    });
    const netBySegment = new Map<string, number>();
    for (const g of grouped) {
      netBySegment.set(g.segmentId, (netBySegment.get(g.segmentId) ?? 0) + (g._sum.delta ?? 0));
    }
    const totals = segments.map((s) => ({ segmentKey: s.key, label: s.label, net: netBySegment.get(s.id) ?? 0 }));
    return { totals, netTotal: totals.reduce((a, t) => a + t.net, 0) };
  }
}
