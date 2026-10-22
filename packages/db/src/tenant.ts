// withTenant: the ONLY way feature code touches the database (BUILD_ORDER ground rule 3).
// Runs an interactive transaction with Postgres session vars set, so RLS policies
// (FORCE ROW LEVEL SECURITY, see extras.sql) scope every statement to one church.
// Never import the bare Prisma client in feature modules — use the TenantService
// wrapper in the api/worker or call withTenant directly.
import { prisma, platformPrisma, Db } from './client';

export interface TenantOptions {
  /** Comma-free array of branch ids the user is restricted to; empty/omitted = church-wide. */
  branchIds?: string[];
}

export async function withTenant<T>(
  churchId: string,
  userId: string | null,
  fn: (tx: Db) => Promise<T>,
  opts: TenantOptions = {},
): Promise<T> {
  if (!churchId) throw new Error('withTenant: churchId is required');
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.church_id', ${churchId}, true)`;
      await tx.$executeRaw`SELECT set_config('app.user_id', ${userId ?? ''}, true)`;
      await tx.$executeRaw`SELECT set_config('app.branch_ids', ${(opts.branchIds ?? []).join(',')}, true)`;
      return fn(tx);
    },
    { timeout: 15_000, maxWait: 5_000 },
  );
}

/**
 * Platform-scope transaction — ONLY for cross-church platform jobs (church
 * creation bootstrap, reconciler fan-out, webhook reference lookup). Feature
 * modules must never call this.
 *
 * MUST run on platformPrisma (platform_user, BYPASSRLS): a bare transaction on
 * the app_user client still has FORCE RLS applied, so cross-tenant writes get
 * 42501-blocked. Caught by db:verify on 22 Oct (seed failed under RLS).
 */
export async function withPlatform<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  return platformPrisma.$transaction(fn, { timeout: 15_000, maxWait: 5_000 });
}
