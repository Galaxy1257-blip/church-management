import { PrismaClient } from '@prisma/client';

// App client: connects with app_user creds — FORCE RLS applies, so every
// query must run inside withTenant (church_id set). Feature code uses only
// this client via TenantService.
const g = globalThis as unknown as { __chmsPrisma?: PrismaClient; __chmsPlatform?: PrismaClient };

export const prisma: PrismaClient = g.__chmsPrisma ?? new PrismaClient({ log: ['warn', 'error'] });

if (process.env.NODE_ENV !== 'production') g.__chmsPrisma = prisma;

/**
 * Platform client: connects with platform_user (BYPASSRLS) when
 * PLATFORM_DATABASE_URL is set — for cross-tenant jobs ONLY (worker,
 * webhook reference lookup, reconciler). Falls back to DATABASE_URL so
 * single-role dev setups still boot (RLS is then only as strong as the
 * connecting role: superuser bypasses even FORCE RLS).
 */
export const platformPrisma: PrismaClient =
  g.__chmsPlatform ??
  new PrismaClient({
    log: ['warn', 'error'],
    datasources: process.env.PLATFORM_DATABASE_URL
      ? { db: { url: process.env.PLATFORM_DATABASE_URL } }
      : undefined,
  });

if (process.env.NODE_ENV !== 'production') g.__chmsPlatform = platformPrisma;

export { Prisma, PrismaClient } from '@prisma/client';
/** Interactive-transaction client (the `tx` passed to withTenant callbacks). */
export type Db = import('@prisma/client').Prisma.TransactionClient;

