// Read-only view over the hash-chained audit log. `audit_event` is created by
// extras.sql, its rows are chained by a trigger and UPDATE/DELETE are blocked by a
// trigger, so nothing here can change the history it reads.
import { Injectable } from '@nestjs/common';
import { Prisma, auditVerify } from '@chms/db';
import { AuthUser } from '../common/guards';
import { TenantService } from '../common/tenant';

export interface AuditListOptions {
  q?: string;
  group?: string;
  before?: string;
  limit?: string;
}

interface EventRow {
  seq: bigint;
  action: string;
  entity: string | null;
  entityId: string | null;
  createdAt: Date;
  actorId: string | null;
  actorName: string | null;
  ip: string | null;
}

export interface AuditEvent {
  seq: number;
  action: string;
  entity: string | null;
  entityId: string | null;
  at: string;
  /** null when no one was signed in behind the act — the public give page, a webhook, a job. */
  actor: string | null;
  ip: string | null;
}

/** One page of the log; `olderThan` is the cursor for the page before this one. */
export interface AuditPage {
  items: AuditEvent[];
  olderThan: number | null;
  more: boolean;
}

const MAX_PAGE = 300;

@Injectable()
export class AuditService {
  constructor(private readonly tenant: TenantService) {}

  /**
   * The log is not a Prisma model and `extras.sql` forces row-level security only on
   * tables that spell the column `churchId` — this one spells it `church_id`. So the
   * church filter is always in this SQL, and a new caller cannot inherit it from RLS.
   *
   * The search covers the columns a person would look at — what happened, which kind
   * of record, and the name of whoever did it — and never the `before`/`after`
   * payloads: those hold whole records, and searching them would turn this screen
   * into a way to fish a value out of the database one guess at a time.
   *
   * The payloads are not sent either. The page answers who did what, when and from
   * where; the values they changed stay in the database, where reading them takes
   * more than opening a screen.
   */
  async list(user: AuthUser, opts: AuditListOptions = {}): Promise<AuditPage> {
    const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), MAX_PAGE);
    const before = Number(opts.before);
    const q = opts.q?.trim() ?? '';
    const group = opts.group?.trim() ?? '';

    const where = [Prisma.sql`e.church_id = ${user.churchId}::uuid`];
    if (Number.isInteger(before) && before > 0) where.push(Prisma.sql`e.seq < ${BigInt(before)}::bigint`);
    if (q) {
      const like = `%${q}%`;
      where.push(
        Prisma.sql`(e.action ILIKE ${like} OR e.entity ILIKE ${like} OR e.entity_id ILIKE ${like} OR COALESCE(u.name, '') ILIKE ${like})`,
      );
    }
    if (group) where.push(Prisma.sql`split_part(e.action, '.', 1) = ${group}`);

    return this.tenant.run(user, async (tx) => {
      // One row past the page so `more` needs no second count.
      const rows = await tx.$queryRaw<EventRow[]>(Prisma.sql`
        SELECT e.seq, e.action, e.entity, e.entity_id AS "entityId", e.created_at AS "createdAt",
               e.actor_id AS "actorId", u.name AS "actorName", e.ip::text AS ip
          FROM audit_event e
          LEFT JOIN "User" u ON u.id = e.actor_id
         WHERE ${Prisma.join(where, ' AND ')}
         ORDER BY e.seq DESC
         LIMIT ${limit + 1}`);
      const items = rows.slice(0, limit).map(toEvent);
      return { items, olderThan: items.length ? items[items.length - 1].seq : null, more: rows.length > limit };
    });
  }

  /** What the log holds, and whether this church's chain still verifies row by row. */
  async summary(user: AuthUser): Promise<{ rows: number; today: number; brokenAtSeq: number | null }> {
    return this.tenant.run(user, async (tx) => {
      const [count] = await tx.$queryRaw<{ rows: bigint; today: bigint }[]>`
        SELECT count(*)::bigint AS rows,
               count(*) FILTER (WHERE created_at >= date_trunc('day', now()))::bigint AS today
          FROM audit_event
         WHERE church_id = ${user.churchId}::uuid`;
      return {
        rows: Number(count?.rows ?? 0),
        today: Number(count?.today ?? 0),
        brokenAtSeq: await auditVerify(tx, user.churchId),
      };
    });
  }

  /**
   * The action prefixes actually in this church's log, so the filter never offers a
   * section the church has never used.
   */
  async groups(user: AuthUser): Promise<string[]> {
    return this.tenant.run(user, async (tx) => {
      const rows = await tx.$queryRaw<{ kind: string }[]>`
        SELECT DISTINCT split_part(action, '.', 1) AS kind
          FROM audit_event
         WHERE church_id = ${user.churchId}::uuid
         ORDER BY kind`;
      return rows.map((r) => r.kind);
    });
  }
}

function toEvent(row: EventRow): AuditEvent {
  return {
    seq: Number(row.seq),
    action: row.action,
    entity: row.entity,
    entityId: row.entityId,
    at: row.createdAt.toISOString(),
    actor: row.actorId ? (row.actorName ?? 'A worker no longer on the team') : null,
    ip: row.ip,
  };
}
