// Apply migrations/2_owner_round2/migration.sql to the local dev + test databases.
// Safe to re-run: every statement is IF NOT EXISTS.
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const sql = readFileSync('migrations/2_owner_round2/migration.sql', 'utf8')
  .split(/\r?\n/)
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')
  .trim();

const dbs = {
  chms: 'postgresql://postgres:postgres@localhost:5432/chms',
  chms_test: 'postgresql://postgres:postgres@localhost:5432/chms_test',
};

for (const [name, url] of Object.entries(dbs)) {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    for (const stmt of sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) {
      await prisma.$executeRawUnsafe(stmt);
    }
    const rows = await prisma.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns WHERE table_name IN ('AgeBracket','Member','Announcement') AND column_name IN ('maleLabel','femaleLabel','photoDataUrl','memberId') ORDER BY column_name`,
    );
    console.log(name, 'OK', rows.map((r) => r.column_name).join(','));
  } catch (error) {
    console.log(name, 'ERR', String(error.message).split('\n')[0]);
  } finally {
    await prisma.$disconnect();
  }
}
