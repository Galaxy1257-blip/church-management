// Members: CRUD, search, QR token issuance, CSV import with preview + dedupe.
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { appendAudit, Db } from '@chms/db';
import {
  ageOn,
  AgeBracketCfg,
  Gender,
  MemberStatus,
  normalizeGhPhone,
  resolveBracket,
} from '@chms/shared';
import { TenantService } from '../common/tenant';
import { AuthUser } from '../common/guards';
import { createHash, randomBytes } from 'node:crypto';

export interface MemberListQuery {
  q?: string;
  status?: MemberStatus;
  ageBracketId?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateMemberInput {
  memberNo?: string;
  firstName: string;
  lastName: string;
  phoneE164?: string;
  email?: string;
  gender?: Gender;
  dob?: string; // YYYY-MM-DD — age/bracket derived in real time
  ageBracketId?: string; // manual override
  joinedAt?: string;
  smsConsent?: boolean;
}

/** Explicit bracket id wins; else dob -> age -> configured bracket. */
export async function resolveMemberBracket(
  tx: Db,
  churchId: string,
  input: { dob?: string | null; ageBracketId?: string | null },
): Promise<{ ageBracketId: string | null; brackets: AgeBracketCfg[] }> {
  const rows = await tx.ageBracket.findMany({ where: { churchId, isActive: true } });
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
  if (input.ageBracketId) return { ageBracketId: input.ageBracketId, brackets };
  if (input.dob) {
    const age = ageOn(input.dob);
    return { ageBracketId: resolveBracket(age, brackets)?.id ?? null, brackets };
  }
  return { ageBracketId: null, brackets };
}

@Injectable()
export class MembersService {
  constructor(private readonly tenant: TenantService) {}

  async list(user: AuthUser, query: MemberListQuery) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 50));
    return this.tenant.run(user, async (tx) => {
      const where: Record<string, unknown> = { churchId: user.churchId, deletedAt: null };
      if (query.status) where.status = query.status;
      if (query.ageBracketId) where.ageBracketId = query.ageBracketId;
      if (query.q) {
        const q = query.q.trim();
        where.OR = [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { memberNo: { contains: q, mode: 'insensitive' } },
          { phoneE164: { contains: q } },
        ];
      }
      const [total, items] = await Promise.all([
        tx.member.count({ where }),
        tx.member.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);
      return { total, page, pageSize, items };
    });
  }

  async getOne(user: AuthUser, id: string) {
    return this.tenant.run(user, async (tx) => {
      const m = await tx.member.findFirst({ where: { id, churchId: user.churchId, deletedAt: null } });
      if (!m) throw new NotFoundException('member not found');
      return m;
    });
  }

  async create(user: AuthUser, input: CreateMemberInput, ip?: string) {
    const phone = input.phoneE164 ? normalizeGhPhone(input.phoneE164) : null;
    return this.tenant.run(user, async (tx) => {
      let memberNo = input.memberNo?.trim();
      if (!memberNo) {
        const count = await tx.member.count({ where: { churchId: user.churchId } });
        memberNo = `M${String(count + 1).padStart(5, '0')}`;
      }
      const { ageBracketId } = await resolveMemberBracket(tx, user.churchId, input);
      const m = await tx.member.create({
        data: {
          churchId: user.churchId,
          memberNo,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          phoneE164: phone,
          email: input.email?.trim() || null,
          gender: input.gender ?? null,
          dob: input.dob ? new Date(`${input.dob.slice(0, 10)}T00:00:00Z`) : null,
          ageBracketId,
          joinedAt: input.joinedAt ? new Date(input.joinedAt) : new Date(),
          smsConsent: input.smsConsent ?? true,
          smsConsentAt: input.smsConsent === false ? null : new Date(),
        },
      });
      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: 'member.create',
        entity: 'Member',
        entityId: m.id,
        after: m,
        ip,
      });
      return m;
    });
  }

  async update(
    user: AuthUser,
    id: string,
    input: Partial<CreateMemberInput> & { status?: MemberStatus },
    ip?: string,
  ) {
    const phone = input.phoneE164 ? normalizeGhPhone(input.phoneE164) : undefined;
    return this.tenant.run(user, async (tx) => {
      const existing = await tx.member.findFirst({ where: { id, churchId: user.churchId, deletedAt: null } });
      if (!existing) throw new NotFoundException('member not found');
      let bracketPatch: Record<string, unknown> = {};
      if (input.dob !== undefined || input.ageBracketId !== undefined) {
        const resolved = await resolveMemberBracket(tx, user.churchId, {
          dob: input.dob ?? (input.ageBracketId ? existing.dob?.toISOString() : existing.dob?.toISOString()),
          ageBracketId: input.ageBracketId,
        });
        bracketPatch = {
          dob: input.dob ? new Date(`${input.dob.slice(0, 10)}T00:00:00Z`) : input.dob === null ? null : undefined,
          ageBracketId: resolved.ageBracketId,
        };
      }
      const updated = await tx.member.update({
        where: { id },
        data: {
          ...(input.firstName !== undefined ? { firstName: input.firstName.trim() } : {}),
          ...(input.lastName !== undefined ? { lastName: input.lastName.trim() } : {}),
          ...(phone !== undefined ? { phoneE164: phone } : {}),
          ...(input.email !== undefined ? { email: input.email || null } : {}),
          ...(input.gender !== undefined ? { gender: input.gender } : {}),
          ...bracketPatch,
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.smsConsent !== undefined
            ? { smsConsent: input.smsConsent, smsConsentAt: input.smsConsent ? new Date() : null }
            : {}),
        },
      });
      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: 'member.update',
        entity: 'Member',
        entityId: id,
        before: existing,
        after: updated,
        ip,
      });
      return updated;
    });
  }

  /** Soft delete (kept for audit); phone stays recorded to avoid ghost dupes. */
  async remove(user: AuthUser, id: string, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const existing = await tx.member.findFirst({ where: { id, churchId: user.churchId, deletedAt: null } });
      if (!existing) throw new NotFoundException('member not found');
      const deleted = await tx.member.update({ where: { id }, data: { deletedAt: new Date(), status: 'INACTIVE' } });
      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: 'member.delete',
        entity: 'Member',
        entityId: id,
        before: existing,
        after: deleted,
        ip,
      });
      return { id, deleted: true };
    });
  }

  /**
   * Issue a check-in QR token: the server stores only the sha256 hash; the raw
   * token is returned exactly once (check-in hashes the presented token).
   */
  async issueQr(user: AuthUser, id: string, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const existing = await tx.member.findFirst({ where: { id, churchId: user.churchId, deletedAt: null } });
      if (!existing) throw new NotFoundException('member not found');
      const raw = randomBytes(16).toString('hex'); // 128-bit
      const hash = createHash('sha256').update(raw).digest('hex');
      await tx.member.update({ where: { id }, data: { qrToken: hash, qrIssuedAt: new Date() } });
      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: 'member.qr.issue',
        entity: 'Member',
        entityId: id,
        ip,
      });
      return { token: raw };
    });
  }

  /** Rule-based churn risk: active members with no check-in within N days. */
  churn(user: AuthUser, days = 60) {
    return this.tenant.run(user, async (tx) => {
      const since = new Date(Date.now() - days * 86400_000);
      const rows = await tx.$queryRaw<{ id: string; firstname: string; lastname: string; phone: string | null; lastin: Date | null }[]>`
        SELECT m.id, m."firstName" AS firstname, m."lastName" AS lastname, m."phoneE164" AS phone,
               (SELECT MAX(a."checkedInAt") FROM "Attendance" a WHERE a."memberId" = m.id) AS lastin
        FROM "Member" m
        WHERE m."churchId" = ${user.churchId}::uuid AND m."deletedAt" IS NULL AND m.status = 'ACTIVE'
        ORDER BY lastin NULLS FIRST
        LIMIT 500`;
      return rows
        .filter((r) => !r.lastin || new Date(r.lastin) < since)
        .map((r) => ({
          memberId: r.id,
          name: `${r.firstname} ${r.lastname}`,
          phoneE164: r.phone,
          lastCheckIn: r.lastin,
          risk: r.lastin ? 'COOLING' : 'NEVER_SEEN',
        }));
    });
  }

  // ---- R4.8 milestones / R4.12 discipleship ----

  saveMilestones(
    user: AuthUser,
    memberId: string,
    patch: { salvationDate?: string | null; baptismDate?: string | null; marriageDate?: string | null; ordinationDate?: string | null },
    ip?: string,
  ) {
    const parse = (v: string | null | undefined): Date | null | undefined =>
      v === undefined ? undefined : v === null || v === '' ? null : new Date(v);
    const sal = parse(patch.salvationDate);
    const bap = parse(patch.baptismDate);
    const mar = parse(patch.marriageDate);
    const ord = parse(patch.ordinationDate);
    return this.tenant.run(user, async (tx) => {
      const before = await tx.member.findFirst({ where: { id: memberId, churchId: user.churchId, deletedAt: null } });
      if (!before) throw new NotFoundException('member not found');
      const data = {
        ...(sal !== undefined ? { salvationDate: sal } : {}),
        ...(bap !== undefined ? { baptismDate: bap } : {}),
        ...(mar !== undefined ? { marriageDate: mar } : {}),
        ...(ord !== undefined ? { ordinationDate: ord } : {}),
      };
      const updated = await tx.member.update({ where: { id: memberId }, data });
      await appendAudit(tx, {
        churchId: user.churchId, actorId: user.userId, action: 'member.milestones.update',
        entity: 'Member', entityId: memberId,
        before: { salvationDate: before.salvationDate, baptismDate: before.baptismDate, marriageDate: before.marriageDate, ordinationDate: before.ordinationDate },
        after: data, ip,
      });
      return updated;
    });
  }

  static readonly STAGES = ['VISITOR', 'NEW_BELIEVER', 'MEMBER', 'WORKER', 'LEADER'] as const;

  setStage(user: AuthUser, memberId: string, stage: string, ip?: string) {
    if (!(MembersService.STAGES as readonly string[]).includes(stage)) throw new BadRequestException(`unknown stage ${stage}`);
    return this.tenant.run(user, async (tx) => {
      const m = await tx.member.findFirst({ where: { id: memberId, churchId: user.churchId, deletedAt: null } });
      if (!m) throw new NotFoundException('member not found');
      await tx.member.update({ where: { id: memberId }, data: { discipleshipStage: stage } });
      await appendAudit(tx, {
        churchId: user.churchId, actorId: user.userId, action: 'member.stage.update',
        entity: 'Member', entityId: memberId, before: { stage: m.discipleshipStage }, after: { stage }, ip,
      });
      return { id: memberId, stage };
    });
  }

  /** R4.12 stage report: counts per stage. */
  stageReport(user: AuthUser) {
    return this.tenant.run(user, async (tx) => {
      const rows = await tx.member.groupBy({
        by: ['discipleshipStage'],
        where: { churchId: user.churchId, deletedAt: null },
        _count: true,
      });
      const byStage = (MembersService.STAGES as readonly string[]).map((s) => ({
        stage: s,
        count: rows.find((r) => r.discipleshipStage === s)?._count ?? 0,
      }));
      const untracked = rows.find((r) => r.discipleshipStage === null)?._count ?? 0;
      return { byStage, untracked };
    });
  }

  /** R4.8 pastoral milestone log. */
  pastoralActions(user: AuthUser, opts: { memberId?: string; limit?: number } = {}) {
    return this.tenant.run(user, (tx) =>
      tx.pastoralAction.findMany({
        where: { churchId: user.churchId, ...(opts.memberId ? { memberId: opts.memberId } : {}) },
        orderBy: { actionDate: 'desc' },
        take: Math.min(300, opts.limit ?? 100),
      }),
    );
  }

  addPastoralAction(
    user: AuthUser,
    input: { type: string; memberId?: string | null; actionDate: string; note?: string },
    ip?: string,
  ) {
    const allowed = ['SALVATION', 'BAPTISM', 'WEDDING', 'DEDICATION', 'ORDINATION', 'CLASS_COMPLETED', 'FUNERAL', 'OTHER'];
    if (!allowed.includes(input.type)) throw new BadRequestException(`unknown pastoral action ${input.type}`);
    return this.tenant.run(user, async (tx) => {
      const a = await tx.pastoralAction.create({
        data: {
          churchId: user.churchId,
          memberId: input.memberId ?? null,
          type: input.type,
          actionDate: new Date(input.actionDate),
          note: input.note?.trim() || null,
          performedBy: user.userId,
        },
      });
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: 'pastoral.add', entity: 'PastoralAction', entityId: a.id, after: a, ip });
      return a;
    });
  }

  /** R4.11 data-access-request: full personal-data export for one member. */
  exportMember(user: AuthUser, memberId: string) {
    return this.tenant.run(user, async (tx) => {
      const member = await tx.member.findFirst({ where: { id: memberId, churchId: user.churchId, deletedAt: null } });
      if (!member) throw new NotFoundException('member not found');
      const [attendance, transactions, groups, tasks, actions] = await Promise.all([
        tx.attendance.findMany({ where: { churchId: user.churchId, memberId }, orderBy: { checkedInAt: 'desc' }, take: 500, select: { checkedInAt: true, method: true, serviceId: true } }),
        tx.transaction.findMany({ where: { churchId: user.churchId, memberId }, orderBy: { createdAt: 'desc' }, take: 500, select: { reference: true, giftMinor: true, status: true, createdAt: true, channel: true } }),
        tx.groupMember.findMany({ where: { memberId }, select: { groupId: true } }),
        tx.careTask.findMany({ where: { churchId: user.churchId, memberId }, select: { type: true, status: true, dueAt: true, note: true, createdAt: true } }),
        tx.pastoralAction.findMany({ where: { churchId: user.churchId, memberId }, select: { type: true, actionDate: true, note: true } }),
      ]);
      return {
        exportedAt: new Date().toISOString(),
        subject: 'Act 843 data-access request',
        member,
        attendance,
        transactions,
        groups,
        careTasks: tasks,
        pastoralActions: actions,
      };
    });
  }
}

