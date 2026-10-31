// Pastoral care: prayer requests (moderated wall), counseling notes
// (AES-GCM encrypted at rest, RBAC-restricted), welfare requests.
import { BadRequestException, Body, Controller, Get, Injectable, Module, Param, Post, Query, Req } from '@nestjs/common';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { appendAudit, Db } from '@chms/db';
import { hasPermission } from '@chms/shared';
import { RequirePermissions } from '../common/decorators';
import { AuthedRequest, AuthUser } from '../common/guards';
import { TenantService } from '../common/tenant';
import { decryptNote, encryptNote } from './crypto';

class PrayerDto {
  @IsString() @MinLength(3) body!: string;
  @IsOptional() @IsBoolean() isAnonymous?: boolean;
  @IsOptional() @IsBoolean() shareToWall?: boolean;
  @IsOptional() @IsIn(['PASTORAL_ONLY', 'FOLLOWUP_TEAM']) visibility?: 'PASTORAL_ONLY' | 'FOLLOWUP_TEAM';
}
class CounselingDto {
  @IsString() subjectId!: string;
  @IsString() @MinLength(3) body!: string;
  @IsOptional() @IsString() sharedWith?: string;
}
class WelfareDto {
  @IsString() memberId!: string;
  @IsString() category!: string;
  @IsString() @MinLength(3) description!: string;
  @IsOptional() @IsInt() @Min(1) amountRequestedMinor?: number;
}

@Injectable()
export class CareService {
  constructor(private readonly tenant: TenantService) {}

  /**
   * A Sunday School teacher's care world is the one class the office assigned.
   * Anyone who can already read the member directory (pastor, usher, elder,
   * follow-up) is not narrowed: their role is church-wide, even if a class was
   * left on the user record. A care-only role with no class assigned is still
   * class-scoped — an empty queue, never "everyone".
   */
  private classScope(
    user: AuthUser,
  ): { bracketId: string | null; segment: 'ALL' | 'MALE' | 'FEMALE' } | null {
    if (hasPermission(user.permissions, 'members:read')) return null;
    const segment =
      user.careClassSegment === 'MALE' || user.careClassSegment === 'FEMALE' ? user.careClassSegment : 'ALL';
    return { bracketId: user.careClassBracketId ?? null, segment };
  }

  private classMemberWhere(user: AuthUser, scope: { bracketId: string; segment: 'ALL' | 'MALE' | 'FEMALE' }) {
    return {
      churchId: user.churchId,
      deletedAt: null,
      ageBracketId: scope.bracketId,
      ...(scope.segment === 'MALE'
        ? { gender: 'MALE' as const }
        : scope.segment === 'FEMALE'
          ? { gender: 'FEMALE' as const }
          : {}),
    };
  }

  private async classMemberIds(
    tx: Db,
    user: AuthUser,
    scope: { bracketId: string | null; segment: 'ALL' | 'MALE' | 'FEMALE' },
  ): Promise<string[]> {
    const bracketId = scope.bracketId;
    if (!bracketId) return [];
    const rows = await tx.member.findMany({ where: this.classMemberWhere(user, { ...scope, bracketId }), select: { id: true } });
    return rows.map((r) => r.id);
  }

  prayers(user: AuthUser, opts: { wall?: boolean } = {}) {
    const scope = this.classScope(user);
    return this.tenant.run(user, (tx) =>
      tx.prayerRequest.findMany({
        // The public wall is for everyone. Everything else on the wall is the
        // teacher's own request; a whole-church feed stays with the care team.
        where: opts.wall
          ? { churchId: user.churchId, shareToWall: true, moderation: 'APPROVED' }
          : scope
            ? {
                churchId: user.churchId,
                OR: [
                  { shareToWall: true, moderation: 'APPROVED' },
                  { submittedBy: user.userId },
                ],
              }
            : { churchId: user.churchId },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    );
  }

  addPrayer(user: AuthUser, input: PrayerDto, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const p = await tx.prayerRequest.create({
        data: {
          churchId: user.churchId,
          submittedBy: user.userId,
          body: input.body,
          isAnonymous: input.isAnonymous ?? false,
          shareToWall: input.shareToWall ?? false,
          visibility: input.visibility ?? 'FOLLOWUP_TEAM',
          moderation: input.shareToWall ? 'PENDING' : 'APPROVED',
        },
      });
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: 'prayer.add', entity: 'PrayerRequest', entityId: p.id, ip });
      return p;
    });
  }

  moderatePrayer(user: AuthUser, id: string, approve: boolean) {
    return this.tenant.run(user, async (tx) => {
      const p = await tx.prayerRequest.findFirst({ where: { id, churchId: user.churchId } });
      if (!p) throw new Error('prayer request not found');
      return tx.prayerRequest.update({ where: { id }, data: { moderation: approve ? 'APPROVED' : 'REJECTED' } });
    });
  }

  async addCounseling(user: AuthUser, input: CounselingDto, ip?: string) {
    const scope = this.classScope(user);
    return this.tenant.run(user, async (tx) => {
      const bracketId = scope?.bracketId ?? null;
      if (scope) {
        if (!bracketId) throw new BadRequestException('Your Sunday School class is not set up yet — ask your church office.');
        const subject = await tx.member.findFirst({
          where: { id: input.subjectId, ...this.classMemberWhere(user, { ...scope, bracketId }) },
          select: { id: true },
        });
        if (!subject) throw new BadRequestException('That child is not in your class.');
      }
      const enc = await encryptNote(tx, user.churchId, input.body);
      const n = await tx.counselingNote.create({
        data: {
          churchId: user.churchId,
          subjectId: input.subjectId,
          authorId: user.userId,
          bodyCipher: enc.cipher as any,
          nonce: enc.nonce as any,
          keyVersion: enc.keyVersion,
          sharedWith: input.sharedWith ? input.sharedWith.split(',').map((s) => s.trim()).filter(Boolean) : [],
        },
      });
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: 'counseling.add', entity: 'CounselingNote', entityId: n.id, ip });
      return { id: n.id, createdAt: n.createdAt };
    });
  }

  listCounseling(user: AuthUser, subjectId: string) {
    return this.tenant.run(user, async (tx) => {
      const rows = await tx.counselingNote.findMany({
        where: { churchId: user.churchId, subjectId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      const allowed = rows.filter((r) => r.authorId === user.userId || r.sharedWith.includes(user.userId));
      return Promise.all(
        allowed.map(async (r) => ({
          id: r.id,
          authorId: r.authorId,
          createdAt: r.createdAt,
          body: await decryptNote(tx, user.churchId, { cipher: r.bodyCipher, nonce: r.nonce, keyVersion: r.keyVersion }),
        })),
      );
    });
  }

  welfare(user: AuthUser) {
    return this.tenant.run(user, async (tx) => {
      const rows = await tx.welfareRequest.findMany({ where: { churchId: user.churchId }, orderBy: { createdAt: 'desc' }, take: 200 });
      const members = await this.membersById(tx, user.churchId, rows.map((r) => r.memberId));
      return rows.map((r) => ({ ...r, member: members.get(r.memberId) ?? null }));
    });
  }

  /** Names/phones so the care screens can open a member profile. */
  private async membersById(tx: Db, churchId: string, ids: (string | null)[]) {
    const unique = [...new Set(ids.filter((v): v is string => Boolean(v)))];
    if (!unique.length) return new Map<string, { id: string; firstName: string; lastName: string; phoneE164: string | null; address: string | null; photoDataUrl: string | null }>();
    const rows = await tx.member.findMany({
      where: { churchId, id: { in: unique } },
      select: { id: true, firstName: true, lastName: true, phoneE164: true, address: true, photoDataUrl: true },
    });
    return new Map(rows.map((r) => [r.id, r]));
  }

  async addWelfare(user: AuthUser, input: WelfareDto, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const enc = await encryptNote(tx, user.churchId, input.description);
      const w = await tx.welfareRequest.create({
        data: {
          churchId: user.churchId,
          memberId: input.memberId,
          category: input.category,
          descriptionCipher: enc.cipher as any,
          nonce: enc.nonce as any,
          keyVersion: enc.keyVersion,
          amountRequestedMinor: input.amountRequestedMinor ?? null,
          status: 'SUBMITTED',
        },
      });
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: 'welfare.submit', entity: 'WelfareRequest', entityId: w.id, ip });
      return { id: w.id, status: w.status };
    });
  }

  decideWelfare(user: AuthUser, id: string, status: 'APPROVED' | 'DECLINED', ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const w = await tx.welfareRequest.findFirst({ where: { id, churchId: user.churchId } });
      if (!w) throw new Error('welfare request not found');
      await tx.welfareRequest.update({ where: { id }, data: { status, approvedBy: user.userId } });
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: `welfare.${status.toLowerCase()}`, entity: 'WelfareRequest', entityId: id, ip });
      return { id, status };
    });
  }

  // ---- R4.9 care queue: visits (hospital/bereavement/home) + assignments ----

  /** The teacher's class and the children they may log a visit for. */
  classOverview(user: AuthUser) {
    const scope = this.classScope(user);
    const bracketId = scope?.bracketId ?? null;
    if (!scope || !bracketId) return Promise.resolve({ className: null as string | null, members: [] });
    return this.tenant.run(user, async (tx) => {
      const bracket = await tx.ageBracket.findFirst({ where: { id: bracketId, churchId: user.churchId } });
      const members = await tx.member.findMany({
        where: this.classMemberWhere(user, { ...scope, bracketId }),
        select: { id: true, firstName: true, lastName: true },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      });
      const fallback = scope.segment === 'MALE' ? 'Boys' : scope.segment === 'FEMALE' ? 'Girls' : 'My class';
      const className = bracket
        ? scope.segment === 'MALE'
          ? bracket.maleLabel ?? `${bracket.label} (Boys)`
          : scope.segment === 'FEMALE'
            ? bracket.femaleLabel ?? `${bracket.label} (Girls)`
            : bracket.label
        : fallback;
      return { className, members };
    });
  }

  careTasks(user: AuthUser, opts: { status?: string; type?: string } = {}) {
    const scope = this.classScope(user);
    return this.tenant.run(user, async (tx) => {
      const classIds = scope ? await this.classMemberIds(tx, user, scope) : null;
      if (classIds && classIds.length === 0) return [];
      const tasks = await tx.careTask.findMany({
        where: {
          churchId: user.churchId,
          ...(classIds ? { memberId: { in: classIds } } : {}),
          ...(opts.status ? { status: opts.status } : {}),
          ...(opts.type ? { type: opts.type } : {}),
        },
        orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
        take: 200,
      });
      const members = await this.membersById(tx, user.churchId, tasks.map((t) => t.memberId));
      return tasks.map((t) => ({ ...t, member: t.memberId ? members.get(t.memberId) ?? null : null }));
    });
  }

  addCareTask(
    user: AuthUser,
    input: {
      type: string;
      memberId?: string;
      visitorId?: string;
      note?: string;
      dueAt?: string;
      assignedTo?: string;
    },
    ip?: string,
  ) {
    const allowed = [
      'VISIT_HOSPITAL', 'VISIT_BEREAVEMENT', 'VISIT_HOME', 'FUNERAL_SUPPORT',
      'MISSING_MEMBER', 'CALL_REQUESTED', 'TASK_STEP',
    ];
    if (!allowed.includes(input.type)) throw new Error(`bad task type ${input.type}`);
    const scope = this.classScope(user);
    return this.tenant.run(user, async (tx) => {
      const bracketId = scope?.bracketId ?? null;
      if (scope) {
        if (!bracketId) throw new BadRequestException('Your Sunday School class is not set up yet — ask your church office.');
        if (!input.memberId) throw new BadRequestException('Pick a child from your class.');
        const child = await tx.member.findFirst({
          where: { id: input.memberId, ...this.classMemberWhere(user, { ...scope, bracketId }) },
          select: { id: true },
        });
        if (!child) throw new BadRequestException('That child is not in your class.');
      } else if (input.memberId) {
        const m = await tx.member.findFirst({ where: { id: input.memberId, churchId: user.churchId, deletedAt: null } });
        if (!m) throw new Error('member not found');
      }
      const t = await tx.careTask.create({
        data: {
          churchId: user.churchId,
          type: input.type,
          memberId: input.memberId ?? null,
          visitorId: input.visitorId ?? null,
          note: input.note?.trim() || null,
          dueAt: input.dueAt ? new Date(input.dueAt) : new Date(),
          assignedTo: input.assignedTo ?? user.userId,
        },
      });
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: 'care.task.create', entity: 'CareTask', entityId: t.id, after: t, ip });
      return t;
    });
  }

  updateCareTask(
    user: AuthUser,
    id: string,
    patch: { status?: string; assignedTo?: string | null; note?: string; dueAt?: string },
    ip?: string,
  ) {
    const scope = this.classScope(user);
    return this.tenant.run(user, async (tx) => {
      const t = await tx.careTask.findFirst({ where: { id, churchId: user.churchId } });
      if (!t) throw new Error('care task not found');
      if (scope) {
        const classIds = await this.classMemberIds(tx, user, scope);
        if (!t.memberId || !classIds.includes(t.memberId)) {
          throw new BadRequestException('That task is not in your class.');
        }
      }
      const updated = await tx.careTask.update({
        where: { id },
        data: {
          ...(patch.status ? { status: patch.status } : {}),
          ...(patch.assignedTo !== undefined ? { assignedTo: patch.assignedTo } : {}),
          ...(patch.note !== undefined ? { note: patch.note } : {}),
          ...(patch.dueAt ? { dueAt: new Date(patch.dueAt) } : {}),
        },
      });
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: 'care.task.update', entity: 'CareTask', entityId: id, before: { status: t.status }, after: { status: updated.status }, ip });
      return updated;
    });
  }
}

@Controller()
export class CareController {
  constructor(private readonly svc: CareService) {}

  @RequirePermissions('care:read')
  @Get('prayer')
  prayers(@Req() req: AuthedRequest, @Query('wall') wall?: string) {
    return this.svc.prayers(req.user!, { wall: wall === 'true' });
  }

  @RequirePermissions('care:write')
  @Post('prayer')
  addPrayer(@Req() req: AuthedRequest, @Body() dto: PrayerDto) {
    return this.svc.addPrayer(req.user!, dto, req.ip);
  }

  @RequirePermissions('care:moderate')
  @Post('prayer/:id/moderate')
  moderate(@Req() req: AuthedRequest, @Param('id') id: string, @Body('approve') approve: boolean) {
    return this.svc.moderatePrayer(req.user!, id, approve !== false);
  }

  @RequirePermissions('care:write')
  @Post('counseling')
  addCounseling(@Req() req: AuthedRequest, @Body() dto: CounselingDto) {
    return this.svc.addCounseling(req.user!, dto, req.ip);
  }

  @RequirePermissions('care:read')
  @Get('counseling/:subjectId')
  listCounseling(@Req() req: AuthedRequest, @Param('subjectId') subjectId: string) {
    return this.svc.listCounseling(req.user!, subjectId);
  }

  @RequirePermissions('welfare:read')
  @Get('welfare')
  welfare(@Req() req: AuthedRequest) {
    return this.svc.welfare(req.user!);
  }

  @RequirePermissions('welfare:write')
  @Post('welfare')
  addWelfare(@Req() req: AuthedRequest, @Body() dto: WelfareDto) {
    return this.svc.addWelfare(req.user!, dto, req.ip);
  }

  @RequirePermissions('welfare:write')
  @Post('welfare/:id/decide')
  decideWelfare(@Req() req: AuthedRequest, @Param('id') id: string, @Body('status') status: 'APPROVED' | 'DECLINED') {
    return this.svc.decideWelfare(req.user!, id, status, req.ip);
  }

  // ---- R4.9 care queue (visits + assignments + missing-member follow-ups) ----

  @RequirePermissions('care:read')
  @Get('care/class')
  classOverview(@Req() req: AuthedRequest) {
    return this.svc.classOverview(req.user!);
  }

  @RequirePermissions('care:read')
  @Get('tasks')
  careTasks(@Req() req: AuthedRequest, @Query('status') status?: string, @Query('type') type?: string) {
    return this.svc.careTasks(req.user!, { status, type });
  }

  @RequirePermissions('care:write')
  @Post('tasks')
  addCareTask(@Req() req: AuthedRequest, @Body() dto: { type: string; memberId?: string; visitorId?: string; note?: string; dueAt?: string; assignedTo?: string }) {
    return this.svc.addCareTask(req.user!, dto, req.ip);
  }

  @RequirePermissions('care:write')
  @Post('tasks/:id')
  updateCareTask(@Req() req: AuthedRequest, @Param('id') id: string, @Body() dto: { status?: string; assignedTo?: string | null; note?: string; dueAt?: string }) {
    return this.svc.updateCareTask(req.user!, id, dto, req.ip);
  }
}

@Module({
  providers: [TenantService, CareService],
  controllers: [CareController],
})
export class CareModule {}
