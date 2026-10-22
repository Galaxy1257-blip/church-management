export { prisma, platformPrisma, Prisma, PrismaClient } from './client';
export type { Db } from './client';
export { withTenant, withPlatform } from './tenant';
export type { TenantOptions } from './tenant';
export { appendAudit, auditChainHead, auditVerify } from './audit';
export type { AuditEntry, AuditChainHead } from './audit';
export { seedChurchDefaults } from './seed-church';
export type { SeedResult } from './seed-church';


