// Seed church defaults: roles/permissions, funds, headcount segments, visitor
// workflow, service template, expense categories, giving settings, wallet.
// Idempotent — safe to re-run. Runs inside withTenant so RLS is satisfied.
import { Db } from './client';
import { withTenant } from './tenant';
import { appendAudit } from './audit';
import {
  DEFAULT_BRACKETS,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_FUNDS,
  DEFAULT_ROLES,
  ONLINE_SEGMENT,
  VISITOR_WORKFLOW_STEPS,
  permissionsForRoleSeed,
} from './seed-constants';

export interface SeedResult {
  churchId: string;
  createdRoles: number;
  updatedRoles: number;
  createdFunds: number;
  createdSegments: number;
  workflowId: string | null;
}

export async function seedChurchDefaults(churchId: string, actorId: string | null): Promise<SeedResult> {
  return withTenant(churchId, actorId, async (tx: Db) => {
    let createdRoles = 0;
    let updatedRoles = 0;
    for (const role of DEFAULT_ROLES) {
      const permissions = permissionsForRoleSeed(role.key);
      const existing = await tx.role.findUnique({ where: { churchId_key: { churchId, key: role.key } } });
      if (!existing) {
        await tx.role.create({
          data: { churchId, key: role.key, name: role.name, permissions },
        });
        createdRoles++;
        continue;
      }
      // Keep default presets in sync: new roles (PASTOR) and widened presets must
      // reach churches that were seeded before the preset changed. Custom roles
      // are never touched — only the keys listed in DEFAULT_ROLES.
      const drift =
        existing.permissions.length !== permissions.length ||
        permissions.some((p) => !existing.permissions.includes(p));
      if (drift) {
        await tx.role.update({ where: { id: existing.id }, data: { permissions } });
        updatedRoles++;
      }
    }

    let createdFunds = 0;
    for (const fund of DEFAULT_FUNDS) {
      const existing = await tx.fund.findFirst({ where: { churchId, name: fund.name } });
      if (!existing) {
        await tx.fund.create({ data: { churchId, name: fund.name, type: fund.type } });
        createdFunds++;
      }
    }

    let createdSegments = 0;
    let sortOrder = 0;
    for (const b of DEFAULT_BRACKETS) {
      sortOrder += 10;
      const existing = await tx.ageBracket.findUnique({ where: { churchId_key: { churchId, key: b.key } } });
      if (!existing) {
        await tx.ageBracket.create({
          data: {
            churchId,
            key: b.key,
            label: b.label,
            minAge: b.minAge,
            maxAge: b.maxAge,
            genderSplit: b.genderSplit,
            segmentKey: b.segmentKey,
            sortOrder,
          },
        });
      }
      const segs = b.genderSplit
        ? [
            { key: `${b.segmentKey}_M`, label: `${b.label} (Men)`, kind: 'IN_PERSON' as const },
            { key: `${b.segmentKey}_W`, label: `${b.label} (Women)`, kind: 'IN_PERSON' as const },
          ]
        : [{ key: b.segmentKey, label: b.label, kind: 'IN_PERSON' as const }];
      for (const s of segs) {
        const seg = await tx.headcountSegment.findUnique({ where: { churchId_key: { churchId, key: s.key } } });
        if (!seg) {
          await tx.headcountSegment.create({
            data: { churchId, key: s.key, label: s.label, kind: s.kind, sortOrder },
          });
          createdSegments++;
        }
      }
    }
    const live = await tx.headcountSegment.findUnique({
      where: { churchId_key: { churchId, key: ONLINE_SEGMENT.key } },
    });
    if (!live) {
      await tx.headcountSegment.create({
        data: {
          churchId,
          key: ONLINE_SEGMENT.key,
          label: ONLINE_SEGMENT.label,
          kind: 'ONLINE',
          sortOrder: ONLINE_SEGMENT.sortOrder,
        },
      });
      createdSegments++;
    }

    for (const name of DEFAULT_EXPENSE_CATEGORIES) {
      const existing = await tx.expenseCategory.findUnique({ where: { churchId_name: { churchId, name } } });
      if (!existing) await tx.expenseCategory.create({ data: { churchId, name } });
    }

    await tx.churchGivingSettings.upsert({ where: { churchId }, create: { churchId }, update: {} });
    // Welcome bundle so a fresh church can send its first OTPs/campaigns in dev.
    // The wallet row must be CREATED first: the old top-up-only check meant no
    // wallet ever existed => every church started at NO_BALANCE (OTP/campaign
    // suppressed). Upsert, then grant once when empty (idempotent on reseed).
    const wallet = await tx.smsWallet.upsert({
      where: { churchId },
      create: { churchId, balanceUnits: 0, reservedUnits: 0 },
      update: {},
    });
    if (wallet.balanceUnits === 0) {
      const welcomeUnits = 500;
      await tx.smsWallet.update({
        where: { churchId },
        data: { balanceUnits: { increment: welcomeUnits } },
      });
      await tx.smsLedger.create({
        data: {
          churchId,
          delta: welcomeUnits,
          reason: 'PURCHASE',
          refType: 'WELCOME_BUNDLE',
          refId: null,
          balanceAfter: welcomeUnits,
          idempotencyKey: `seed:welcome:${churchId}`,
        },
      });
    }
    await tx.onboardingProgress.upsert({
      where: { churchId },
      create: { churchId, defaultsCreated: true },
      update: { defaultsCreated: true },
    });

    // Default visitor follow-up workflow (step worker ships in phase 2)
    let workflowId: string | null = null;
    const existingWf = await tx.followUpWorkflow.findFirst({
      where: { churchId, trigger: 'VISITOR_REGISTERED', name: 'First-Time Visitor Follow-up' },
    });
    if (existingWf) {
      workflowId = existingWf.id;
    } else {
      const wf = await tx.followUpWorkflow.create({
        data: { churchId, name: 'First-Time Visitor Follow-up', trigger: 'VISITOR_REGISTERED', isActive: true, stopOnReply: true },
      });
      const version = await tx.followUpWorkflowVersion.create({
        data: { workflowId: wf.id, version: 1, isPublished: true, createdBy: actorId ?? wf.id },
      });
      for (const step of VISITOR_WORKFLOW_STEPS) {
        await tx.followUpStep.create({
          data: {
            versionId: version.id,
            position: step.position,
            type: 'SMS',
            delayFrom: 'ENROLLMENT',
            delayMinutes: step.delayMinutes,
            template: step.template,
          },
        });
      }
      workflowId = wf.id;
    }

    const segments = await tx.headcountSegment.findMany({ where: { churchId, isActive: true } });
    const existingTpl = await tx.serviceTemplate.findFirst({ where: { churchId, name: 'Sunday Service' } });
    if (!existingTpl) {
      await tx.serviceTemplate.create({
        data: {
          churchId,
          name: 'Sunday Service',
          rrule: 'FREQ=WEEKLY;BYDAY=SU',
          startTime: '09:00',
          segmentIds: segments.map((s) => s.id),
        },
      });
    }

    if (actorId) {
      await appendAudit(tx, {
        churchId,
        actorId,
        action: 'seed.defaults',
        entity: 'Church',
        entityId: churchId,
        after: { createdRoles, updatedRoles, createdFunds, createdSegments, workflowId },
      });
    }

    return { churchId, createdRoles, updatedRoles, createdFunds, createdSegments, workflowId };
  });
}
