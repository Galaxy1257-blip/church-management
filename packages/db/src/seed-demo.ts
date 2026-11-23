// Demo-church showcase data: enough rows that a fresh sign-in to the demo
// tenant fills every dashboard card and the main screens look alive rather
// than empty. Idempotent — safe to re-run. Only ever runs for the demo slug.
import { withTenant } from './tenant';
import { appendAudit } from './audit';
import { platformPrisma as prisma } from './client';
import type { Db } from './client';

// Which optional sections a demo must have on so the cards they feed actually
// render. Resolved flags in the API merge these over MODULE_DEFAULTS.
const DEMO_MODULES = {
  worship: true,
  events: true,
  care: true,
  branches: true,
  departments: true,
  children: true,
  groups: true,
  roster: true,
  followup: true,
};

const MEMBERS: { memberNo: string; firstName: string; lastName: string; gender: 'MALE' | 'FEMALE'; phone: string; joined: string }[] = [
  { memberNo: 'M001', firstName: 'Kwame', lastName: 'Mensah', gender: 'MALE', phone: '+233241000001', joined: '2023-03-12' },
  { memberNo: 'M002', firstName: 'Ama', lastName: 'Owusu', gender: 'FEMALE', phone: '+233241000002', joined: '2022-11-05' },
  { memberNo: 'M003', firstName: 'Yaw', lastName: 'Boateng', gender: 'MALE', phone: '+233241000003', joined: '2023-08-21' },
  { memberNo: 'M004', firstName: 'Akosua', lastName: 'Agyeman', gender: 'FEMALE', phone: '+233241000004', joined: '2021-05-30' },
  { memberNo: 'M005', firstName: 'Kojo', lastName: 'Asante', gender: 'MALE', phone: '+233241000005', joined: '2024-01-14' },
  { memberNo: 'M006', firstName: 'Efua', lastName: 'Darko', gender: 'FEMALE', phone: '+233241000006', joined: '2022-06-18' },
];

export async function seedDemoData(churchId: string, actorId: string | null): Promise<void> {
  const church = await prisma.church.findUnique({ where: { id: churchId } });
  if (!church || church.slug !== 'demo') return;

  // 1) Switch the showcase sections on so their cards are reachable.
  await prisma.church.update({
    where: { id: churchId },
    data: {
      settings: {
        ...((church.settings ?? {}) as object),
        modules: { ...((church.settings as { modules?: object } | null)?.modules ?? {}), ...DEMO_MODULES },
      },
    },
  });

  await withTenant(churchId, actorId, async (tx: Db) => {
    // 2) Members (idempotent on memberNo).
    for (const m of MEMBERS) {
      const existing = await tx.member.findUnique({ where: { churchId_memberNo: { churchId, memberNo: m.memberNo } } });
      if (existing) continue;
      await tx.member.create({
        data: {
          churchId,
          memberNo: m.memberNo,
          firstName: m.firstName,
          lastName: m.lastName,
          gender: m.gender,
          phoneE164: m.phone,
          status: 'ACTIVE',
          smsConsent: true,
          joinedAt: new Date(m.joined),
        },
      });
    }
    const members = await tx.member.findMany({ where: { churchId }, take: 6 });

    // 3) Branches for the transfer row.
    const hq = await tx.branch.findFirst({ where: { churchId, isHq: true } });
    const branchB = await tx.branch.findFirst({ where: { churchId, code: { not: 'HQ' } } });
    let hqBranch = hq;
    let satBranch = branchB;
    if (!hqBranch) {
      hqBranch = await tx.branch.create({
        data: { churchId, name: 'Head Office', code: 'HQ', isHq: true },
      });
    }
    if (!satBranch) {
      satBranch = await tx.branch.create({
        data: { churchId, name: 'East Legon', code: 'EL', isHq: false },
      });
    }

    // 4) A pending transfer for the "Needs you" row (requires ≥1 member).
    if (members[0] && hqBranch && satBranch) {
      const pending = await tx.memberTransfer.findFirst({ where: { churchId, status: 'PENDING' } });
      if (!pending) {
        await tx.memberTransfer.create({
          data: {
            churchId,
            memberId: members[0].id,
            fromBranchId: satBranch.id,
            toBranchId: hqBranch.id,
            requestedBy: actorId ?? members[0].id,
            status: 'PENDING',
          },
        });
      }
    }

    // 5) Care tasks (visit a member, one open follow-up).
    const careCount = await tx.careTask.count({ where: { churchId, status: { in: ['OPEN', 'IN_PROGRESS'] } } });
    if (careCount === 0 && members[1] && members[2]) {
      await tx.careTask.create({
        data: {
          churchId,
          memberId: members[1].id,
          type: 'VISIT_HOME',
          status: 'OPEN',
          dueAt: new Date(Date.now() + 2 * 86_400_000),
          note: 'Check on the family after the bereavement',
        },
      });
      await tx.careTask.create({
        data: {
          churchId,
          memberId: members[2].id,
          type: 'MISSING_MEMBER',
          status: 'OPEN',
          dueAt: new Date(Date.now() + 4 * 86_400_000),
          note: 'Has not been to church in three weeks',
        },
      });
    }

    // 6) Upcoming events.
    const eventCount = await tx.event.count({ where: { churchId, startsAt: { gte: new Date() } } });
    if (eventCount === 0) {
      await tx.event.create({
        data: {
          churchId,
          title: 'Men’s Fellowship',
          description: 'Monthly men’s fellowship and teaching.',
          startsAt: new Date(Date.now() + 5 * 86_400_000),
          venue: 'Main auditorium',
          capacity: 60,
          isPublic: true,
        },
      });
      await tx.event.create({
        data: {
          churchId,
          title: 'Youth Service',
          description: 'Friday youth gathering with praise and word.',
          startsAt: new Date(Date.now() + 9 * 86_400_000),
          venue: 'Youth centre',
          capacity: 40,
          isPublic: true,
        },
      });
    }

    // 7) Extra giving days so the trend has enough points. Idempotent on a
    //    stable reference per date.
    const offering = await tx.fund.findFirst({ where: { churchId, name: 'Offering' } });
    if (offering) {
      const bases = [24000, 31500, 19800, 28700, 35200, 26100];
      for (let i = 1; i <= bases.length; i++) {
        const d = new Date(Date.now() - (bases.length - i) * 7 * 86_400_000);
        const ref = `demo-give-${d.toISOString().slice(0, 10)}`;
        const done = await tx.transaction.findFirst({ where: { churchId, reference: ref } });
        if (done) continue;
        const giftMinor = bases[i - 1];
        await tx.transaction.create({
          data: {
            churchId,
            fundId: offering.id,
            giftMinor,
            feeCoverMinor: 0,
            chargedMinor: giftMinor,
            channel: 'CASH',
            status: 'SUCCESS',
            reference: ref,
            paidAt: d,
            giverName: 'Sunday offering',
          },
        });
      }
    }

    await appendAudit(tx, {
      churchId,
      actorId: actorId ?? 'seed',
      action: 'seed.demo',
      entity: 'Church',
      entityId: churchId,
      after: { members: members.length, modules: DEMO_MODULES },
    });
  });
}