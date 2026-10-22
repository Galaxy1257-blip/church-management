// CLI: ensure a church exists, then apply default seeds.
// Usage: node dist/seed.js [churchSlug]   (default: demo)
import bcrypt from 'bcryptjs';
// Seed is a platform job: church/user lookups must bypass RLS (app_user would
// not see rows outside a church context — church was "not found" on every run).
import { platformPrisma as prisma } from './client';
import { withTenant, withPlatform } from './tenant';
import { seedChurchDefaults } from './seed-church';

async function main(): Promise<void> {
  const slug = process.argv[2] ?? 'demo';
  let church = await prisma.church.findUnique({ where: { slug } });
  let adminId: string | null = null;

  if (!church) {
    console.log(`Church "${slug}" not found — creating it with dev admin 0240000000 / admin1234`);
    const created = await withPlatform(async (tx) => {
      const c = await tx.church.create({ data: { name: slug === 'demo' ? 'Demo Church' : slug, slug } });
      const hash = await bcrypt.hash('admin1234', 10);
      const u = await tx.user.create({
        data: { churchId: c.id, name: 'Dev Admin', phoneE164: '+233240000000', passwordHash: hash },
      });
      return { churchId: c.id, userId: u.id };
    });
    church = { id: created.churchId } as Awaited<ReturnType<typeof prisma.church.findUnique>>;
    adminId = created.userId;
  } else {
    const admin = await prisma.user.findFirst({ where: { churchId: church.id, isActive: true } });
    adminId = admin?.id ?? null;
  }

  const result = await seedChurchDefaults(church!.id, adminId);

  if (adminId) {
    await withTenant(church!.id, adminId, async (tx) => {
      const role = await tx.role.findUnique({
        where: { churchId_key: { churchId: church!.id, key: 'SUPER_ADMIN' } },
      });
      if (role) {
        await tx.userRole.upsert({
          where: { userId_roleId: { userId: adminId!, roleId: role.id } },
          create: { userId: adminId!, roleId: role.id },
          update: {},
        });
      }
    });
  }

  console.log('Seeded:', JSON.stringify(result, null, 2));
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
