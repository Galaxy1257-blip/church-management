// Branches + member transfer workflow (branch-scoped RLS policies are the
// phase-3 hardening item; transfers here keep the two-step approval).
import { Body, Controller, Get, Injectable, Module, Param, Post, Query, Req } from '@nestjs/common';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { appendAudit } from '@chms/db';
import { RequirePermissions } from '../common/decorators';
import { AuthedRequest, AuthUser } from '../common/guards';
import { TenantService } from '../common/tenant';

class BranchDto {
  @IsString() @MinLength(1) name!: string;
  @IsString() @MinLength(1) code!: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() region?: string;
}

@Injectable()
export class BranchesService {
  constructor(private readonly tenant: TenantService) {}

  list(user: AuthUser) {
    return this.tenant.run(user, (tx) => tx.branch.findMany({ where: { churchId: user.churchId } }));
  }

  create(user: AuthUser, input: BranchDto, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const b = await tx.branch.create({ data: { churchId: user.churchId, ...input } });
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: 'branch.create', entity: 'Branch', entityId: b.id, after: b, ip });
      return b;
    });
  }

  requestTransfer(user: AuthUser, input: { memberId: string; toBranchId: string }, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const member = await tx.member.findFirst({ where: { id: input.memberId, churchId: user.churchId, deletedAt: null } });
      if (!member) throw new Error('member not found');
      const t = await tx.memberTransfer.create({
        data: {
          churchId: user.churchId,
          memberId: input.memberId,
          fromBranchId: member.branchId ?? (await tx.branch.findFirstOrThrow({ where: { churchId: user.churchId, isHq: true } })).id,
          toBranchId: input.toBranchId,
          requestedBy: user.userId,
        },
      });
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: 'transfer.request', entity: 'MemberTransfer', entityId: t.id, after: t, ip });
      return t;
    });
  }

  approveTransfer(user: AuthUser, transferId: string, approve: boolean, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const t = await tx.memberTransfer.findFirst({ where: { id: transferId, churchId: user.churchId } });
      if (!t) throw new Error('transfer not found');
      if (t.status !== 'PENDING') return t;
      const updated = await tx.memberTransfer.update({
        where: { id: transferId },
        data: { status: approve ? 'APPROVED' : 'REJECTED', approvedBy: user.userId },
      });
      if (approve) {
        await tx.member.update({ where: { id: t.memberId }, data: { branchId: t.toBranchId } });
      }
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: approve ? 'transfer.approve' : 'transfer.reject', entity: 'MemberTransfer', entityId: transferId, after: updated, ip });
      return updated;
    });
  }

  // ---- R4.5 branch → HQ remittance tracking (2-step approval) ----

  submitRemittance(
    user: AuthUser,
    input: { fromBranchId: string; amountMinor: number; reference: string; note?: string },
    ip?: string,
  ) {
    if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) throw new Error('amountMinor must be a positive integer');
    if (!input.reference?.trim()) throw new Error('deposit reference is required');
    return this.tenant.run(user, async (tx) => {
      const branch = await tx.branch.findFirst({ where: { id: input.fromBranchId, churchId: user.churchId } });
      if (!branch) throw new Error('branch not found');
      const dupe = await tx.remittance.findFirst({
        where: { churchId: user.churchId, fromBranchId: input.fromBranchId, reference: input.reference.trim() },
      });
      if (dupe) return dupe; // idempotent: same reference never double-posts
      const r = await tx.remittance.create({
        data: {
          churchId: user.churchId,
          fromBranchId: input.fromBranchId,
          amountMinor: input.amountMinor,
          reference: input.reference.trim(),
          note: input.note?.trim() || null,
          submittedBy: user.userId,
        },
      });
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: 'remittance.submit', entity: 'Remittance', entityId: r.id, after: r, ip });
      return r;
    });
  }

  listRemittances(user: AuthUser, opts: { branchId?: string; status?: string } = {}) {
    return this.tenant.run(user, (tx) =>
      tx.remittance.findMany({
        where: {
          churchId: user.churchId,
          ...(opts.branchId ? { fromBranchId: opts.branchId } : {}),
          ...(opts.status ? { status: opts.status } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { fromBranch: { select: { name: true, code: true } } },
      }),
    );
  }

  /** Step approvals: APPROVED (trustee), REMITTED (finance posts to HQ), REJECTED. */
  actOnRemittance(user: AuthUser, id: string, action: 'approve' | 'remit' | 'reject', ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const r = await tx.remittance.findFirst({ where: { id, churchId: user.churchId } });
      if (!r) throw new Error('remittance not found');
      const nextStatus =
        action === 'approve' ? 'APPROVED' : action === 'remit' ? 'REMITTED' : 'REJECTED';
      const allowed: Record<string, string[]> = {
        APPROVED: ['SUBMITTED'],
        REMITTED: ['APPROVED'],
        REJECTED: ['SUBMITTED', 'APPROVED'],
      };
      if (!allowed[nextStatus]!.includes(r.status)) {
        throw new Error(`cannot ${action} a remittance in status ${r.status}`);
      }
      const updated = await tx.remittance.update({
        where: { id },
        data: nextStatus === 'REJECTED' || r.status === 'SUBMITTED' ? { status: nextStatus, approvedBy: user.userId } : { status: nextStatus },
      });
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: `remittance.${action}`, entity: 'Remittance', entityId: id, before: { status: r.status }, after: { status: nextStatus }, ip });
      return updated;
    });
  }

  /** Reports: totals per branch/region (denomination selling point). */
  remittanceReport(user: AuthUser) {
    return this.tenant.run(user, async (tx) => {
      const rows = await tx.remittance.groupBy({
        by: ['fromBranchId', 'status'],
        where: { churchId: user.churchId },
        _sum: { amountMinor: true },
        _count: true,
      });
      const branches = await tx.branch.findMany({ where: { churchId: user.churchId }, select: { id: true, name: true, code: true, region: true } });
      const byBranch = branches.map((b) => {
        const mine = rows.filter((r) => r.fromBranchId === b.id);
        return {
          branchId: b.id,
          name: b.name,
          code: b.code,
          region: b.region,
          submittedMinor: mine.find((r) => r.status === 'SUBMITTED')?._sum.amountMinor ?? 0,
          approvedMinor: mine.find((r) => r.status === 'APPROVED')?._sum.amountMinor ?? 0,
          remittedMinor: mine.find((r) => r.status === 'REMITTED')?._sum.amountMinor ?? 0,
          rejectedMinor: mine.find((r) => r.status === 'REJECTED')?._sum.amountMinor ?? 0,
          count: mine.reduce((a, r) => a + r._count, 0),
        };
      });
      return {
        byBranch,
        totals: {
          remittedMinor: byBranch.reduce((a, b) => a + b.remittedMinor, 0),
          inFlightMinor: byBranch.reduce((a, b) => a + b.submittedMinor + b.approvedMinor, 0),
        },
      };
    });
  }
}

@Controller('branches')
export class BranchesController {
  constructor(private readonly svc: BranchesService) {}

  @RequirePermissions('church:read')
  @Get()
  list(@Req() req: AuthedRequest) {
    return this.svc.list(req.user!);
  }

  @RequirePermissions('settings:write')
  @Post()
  create(@Req() req: AuthedRequest, @Body() dto: BranchDto) {
    return this.svc.create(req.user!, dto, req.ip);
  }

  @RequirePermissions('members:write')
  @Post('transfers')
  requestTransfer(@Req() req: AuthedRequest, @Body() dto: { memberId: string; toBranchId: string }) {
    return this.svc.requestTransfer(req.user!, dto, req.ip);
  }

  @RequirePermissions('members:write')
  @Post('transfers/:id/approve')
  approve(@Req() req: AuthedRequest, @Param('id') id: string, @Body('approve') approve: boolean) {
    return this.svc.approveTransfer(req.user!, id, approve !== false, req.ip);
  }

  // ---- R4.5 remittances ----

  @RequirePermissions('giving:write')
  @Post('remittances')
  submitRemittance(@Req() req: AuthedRequest, @Body() dto: { fromBranchId: string; amountMinor: number; reference: string; note?: string }) {
    return this.svc.submitRemittance(req.user!, dto, req.ip);
  }

  @RequirePermissions('finance:read')
  @Get('remittances')
  listRemittances(@Req() req: AuthedRequest, @Query('branchId') branchId?: string, @Query('status') status?: string) {
    return this.svc.listRemittances(req.user!, { branchId, status });
  }

  @RequirePermissions('finance:read')
  @Get('remittances/report')
  remittanceReport(@Req() req: AuthedRequest) {
    return this.svc.remittanceReport(req.user!);
  }

  @RequirePermissions('finance:approve')
  @Post('remittances/:id/:action')
  actRemittance(@Req() req: AuthedRequest, @Param('id') id: string, @Param('action') action: string) {
    if (action !== 'approve' && action !== 'remit' && action !== 'reject') throw new Error('bad action');
    return this.svc.actOnRemittance(req.user!, id, action, req.ip);
  }
}

@Module({
  providers: [TenantService, BranchesService],
  controllers: [BranchesController],
})
export class BranchesModule {}
