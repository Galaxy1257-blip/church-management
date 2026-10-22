// Demographics: user-configurable age brackets, headcount section sync,
// toggles, and the birthday auto-upgrade ("promotion") engine. Every
// promotion writes a hash-chained audit event (audit_event chain).
import { BadRequestException, Injectable } from '@nestjs/common';
import { appendAudit } from '@chms/db';
import { AgeBracketCfg, promotionsFor } from '@chms/shared';
import { AuthUser } from '../common/guards';
import { TenantService } from '../common/tenant';

export interface DemographicSettings {
  autoAssignHeadcount: boolean;
  autoPromote: boolean;
  /** Auditorium capacity; 0 = alerts disabled. Drives 85%/95% overcapacity banners. */
  capacity: number;
}

export const DEFAULT_DEMOGRAPHIC_SETTINGS: DemographicSettings = {
  autoAssignHeadcount: true,
  autoPromote: false,
  capacity: 0,
};

export interface BracketInput {
  key: string;
  label: string;
  minAge: number;
  maxAge?: number | null;
  genderSplit?: boolean;
  segmentKey: string;
  ministryNote?: string;
  sortOrder?: number;
  isActive?: boolean;
}

@Injectable()
export class DemographicsService {
  constructor(private readonly tenant: TenantService) {}

  async settings(user: AuthUser): Promise<DemographicSettings> {
    return this.tenant.run(user, async (tx) => {
      const church = await tx.church.findUniqueOrThrow({ where: { id: user.churchId } });
      const s = (church.settings as any)?.demographics ?? {};
      return { ...DEFAULT_DEMOGRAPHIC_SETTINGS, ...s };
    });
  }

  /** In-tx variant used by check-in auto-sort. */
  async readSettingsInTx(tx: any, churchId: string): Promise<DemographicSettings> {
    const church = await tx.church.findUniqueOrThrow({ where: { id: churchId } });
    const s = (church.settings as any)?.demographics ?? {};
    return { ...DEFAULT_DEMOGRAPHIC_SETTINGS, ...s };
  }

  async saveSettings(user: AuthUser, patch: DemographicSettings, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const church = await tx.church.findUniqueOrThrow({ where: { id: user.churchId } });
      const prev = (church.settings as any) ?? {};
      const merged = { ...DEFAULT_DEMOGRAPHIC_SETTINGS, ...(prev.demographics ?? {}), ...patch };
      const next = { ...prev, demographics: merged };
      await tx.church.update({ where: { id: user.churchId }, data: { settings: next as any } });
      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: 'demographics.settings.update',
        entity: 'Church',
        entityId: user.churchId,
        before: prev.demographics ?? null,
        after: merged,
        ip,
      });
      return merged;
    });
  }

  brackets(user: AuthUser) {
    return this.tenant.run(user, (tx) =>
      tx.ageBracket.findMany({ where: { churchId: user.churchId }, orderBy: { sortOrder: 'asc' } }),
    );
  }

  /** Upsert brackets and keep headcount segments in lockstep. */
  async saveBrackets(user: AuthUser, brackets: BracketInput[], ip?: string) {
    for (const b of brackets) {
      if (b.maxAge != null && b.maxAge < b.minAge) {
        throw new BadRequestException(`maxAge < minAge for ${b.key}`);
      }
    }
    return this.tenant.run(user, async (tx) => {
      const saved: string[] = [];
      let order = 0;
      for (const b of brackets) {
        order += 10;
        const row = await tx.ageBracket.upsert({
          where: { churchId_key: { churchId: user.churchId, key: b.key } },
          create: {
            churchId: user.churchId,
            key: b.key,
            label: b.label,
            minAge: b.minAge,
            maxAge: b.maxAge ?? null,
            genderSplit: b.genderSplit ?? false,
            segmentKey: b.segmentKey,
            ministryNote: b.ministryNote ?? null,
            sortOrder: b.sortOrder ?? order,
            isActive: b.isActive ?? true,
          },
          update: {
            label: b.label,
            minAge: b.minAge,
            maxAge: b.maxAge ?? null,
            genderSplit: b.genderSplit ?? false,
            segmentKey: b.segmentKey,
            ministryNote: b.ministryNote ?? null,
            sortOrder: b.sortOrder ?? order,
            isActive: b.isActive ?? true,
          },
        });
        saved.push(row.id);
        if (row.isActive) {
          const segs = row.genderSplit
            ? [
                { key: `${row.segmentKey}_M`, label: `${row.label} (Men)` },
                { key: `${row.segmentKey}_W`, label: `${row.label} (Women)` },
              ]
            : [{ key: row.segmentKey, label: row.label }];
          for (const s of segs) {
            await tx.headcountSegment.upsert({
              where: { churchId_key: { churchId: user.churchId, key: s.key } },
              create: { churchId: user.churchId, key: s.key, label: s.label, kind: 'IN_PERSON' },
              update: { label: s.label, isActive: true },
            });
          }
        }
      }
      await tx.ageBracket.updateMany({
        where: { churchId: user.churchId, id: { notIn: saved } },
        data: { isActive: false },
      });
      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: 'demographics.brackets.save',
        entity: 'AgeBracket',
        after: { keys: brackets.map((b) => b.key) },
        ip,
      });
      return tx.ageBracket.findMany({ where: { churchId: user.churchId }, orderBy: { sortOrder: 'asc' } });
    });
  }

  counts(user: AuthUser) {
    return this.tenant.run(user, async (tx) => {
      const grouped = await tx.member.groupBy({
        by: ['ageBracketId'],
        where: { churchId: user.churchId, deletedAt: null, status: 'ACTIVE' },
        _count: { _all: true },
      });
      return grouped.map((g) => ({ ageBracketId: g.ageBracketId, count: g._count._all }));
    });
  }

  /** Birthday auto-upgrade scan; apply=false previews only. */
  async runPromotions(user: AuthUser, apply: boolean, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const rows = await tx.ageBracket.findMany({ where: { churchId: user.churchId } });
      const brackets: AgeBracketCfg[] = rows.map((b) => ({
        id: b.id,
        key: b.key,
        label: b.label,
        minAge: b.minAge,
        maxAge: b.maxAge,
        genderSplit: b.genderSplit,
        segmentKey: b.segmentKey,
        isActive: b.isActive,
        sortOrder: b.sortOrder,
      }));
      const members = await tx.member.findMany({
        where: { churchId: user.churchId, deletedAt: null, status: 'ACTIVE', dob: { not: null } },
        select: { id: true, firstName: true, lastName: true, ageBracketId: true, dob: true },
      });
      const promotions = promotionsFor(
        members.map((m) => ({
          id: m.id,
          name: `${m.firstName} ${m.lastName}`,
          ageBracketId: m.ageBracketId,
          dob: m.dob,
        })),
        brackets,
      );
      if (apply) {
        for (const p of promotions) {
          const target = brackets.find((b) => b.key === p.toBracketKey);
          if (!target) continue;
          await tx.member.update({ where: { id: p.id }, data: { ageBracketId: target.id } });
          await appendAudit(tx, {
            churchId: user.churchId,
            actorId: user.userId,
            action: 'member.age_promotion',
            entity: 'Member',
            entityId: p.id,
            before: { bracketKey: p.fromBracketKey },
            after: { bracketKey: p.toBracketKey, age: p.age },
            ip,
          });
        }
      }
      return { applied: apply, promotions };
    });
  }
}
