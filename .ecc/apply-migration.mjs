// Apply migrations/1_pastor_role/migration.sql (ALTER TYPE ... ADD VALUE) to the
// local dev + test databases, then print the resulting enum so the gate log shows
// the before/after state. Safe to re-run: the DDL is IF NOT EXISTS.
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const sql = readFileSync('migrations/1_pastor_role/migration.sql', 'utf8')
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
    await prisma.$executeRawUnsafe(sql);
    const rows = await prisma.$queryRawUnsafe('SELECT enum_range(NULL::"RoleKey") AS r');
    console.log(name, 'OK', String(rows[0].r));
  } catch (error) {
    console.log(name, 'ERR', String(error.message).split('\n')[0]);
  } finally {
    await prisma.$disconnect();
  }
}
