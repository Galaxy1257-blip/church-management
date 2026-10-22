// Hash-chained, append-only audit log (extras.sql owns the table, triggers
// fill seq/prev_hash/row_hash). We only INSERT; UPDATE/DELETE are blocked by
// triggers and the nightly worker re-walks each church's chain.
import { Db } from './client';

export interface AuditEntry {
  churchId: string;
  actorId?: string | null;
  action: string; // e.g. 'member.create', 'giving.webhook.settle', 'auth.login'
  entity?: string | null;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

export async function appendAudit(tx: Db, entry: AuditEntry): Promise<void> {
  const beforeJson = entry.before === undefined ? null : JSON.stringify(entry.before);
  const afterJson = entry.after === undefined ? null : JSON.stringify(entry.after);
  await tx.$executeRaw`
    INSERT INTO audit_event (church_id, actor_id, action, entity, entity_id, "before", "after", ip, user_agent)
    VALUES (
      ${entry.churchId}::uuid,
      ${entry.actorId ?? null}::uuid,
      ${entry.action},
      ${entry.entity ?? null},
      ${entry.entityId ?? null},
      ${beforeJson}::jsonb,
      ${afterJson}::jsonb,
      ${entry.ip ?? null}::inet,
      ${entry.userAgent ?? null}
    )`;
}

export interface AuditChainHead {
  seq: number;
  headHash: string; // hex
}

export async function auditChainHead(tx: Db, churchId: string): Promise<AuditChainHead | null> {
  const rows = await tx.$queryRaw<{ seq: bigint; row_hash: Buffer }[]>`
    SELECT seq, row_hash FROM audit_event WHERE church_id = ${churchId}::uuid ORDER BY seq DESC LIMIT 1`;
  if (rows.length === 0) return null;
  return { seq: Number(rows[0].seq), headHash: rows[0].row_hash.toString('hex') };
}

/**
 * Verify the full hash chain for a church in-database (see audit_verify in
 * extras.sql). Returns the first broken seq, or null when the chain is intact.
 */
export async function auditVerify(tx: Db, churchId: string): Promise<number | null> {
  const rows = await tx.$queryRaw<{ first_bad_seq: bigint | null }[]>`
    SELECT first_bad_seq FROM audit_verify(${churchId}::uuid)`;
  const v = rows[0]?.first_bad_seq;
  return v === null || v === undefined ? null : Number(v);
}
