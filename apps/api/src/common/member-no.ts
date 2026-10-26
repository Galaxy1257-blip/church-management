import type { Prisma } from '@prisma/client';

/**
 * Allocate the next member number for a church inside the caller's transaction.
 *
 * The old scheme was `count() + 1`, which is wrong two ways:
 *  - a race: two concurrent creates read the same count and both try `M00042`,
 *    so the second one fails with P2002 on @@unique([churchId, memberNo]) in
 *    front of the user filling a form;
 *  - a delete: soft-deleting a member lowers the count, so the next create
 *    re-uses a number that is still on a record.
 *
 * Fix: a per-church advisory lock (transaction-scoped, so it is released even if
 * the request dies) serialises allocation, and the number comes from the highest
 * existing `M#####` rather than from a count. Custom/imported numbers that do not
 * match `M<digits>` are ignored by the MAX, so they neither collide nor push the
 * sequence into the thousands.
 */
export async function allocateMemberNo(tx: Prisma.TransactionClient, churchId: string): Promise<string> {
  // hashtext() gives a stable int4 per church id; the ::bigint overload of the
  // advisory lock takes it directly. Same transaction → re-entrant (no deadlock
  // when one import allocates many numbers).
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`member-no:${churchId}`}))`;

  const rows = await tx.$queryRaw<{ max: number | null }[]>`
    SELECT COALESCE(MAX(CAST(SUBSTRING("memberNo" FROM 2) AS INTEGER)), 0) AS max
    FROM "Member"
    WHERE "churchId" = ${churchId}::uuid
      AND "memberNo" ~ '^M[0-9]+$'
  `;
  const next = Number(rows[0]?.max ?? 0) + 1;
  return `M${String(next).padStart(5, '0')}`;
}
