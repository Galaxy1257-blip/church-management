// Visitor registration (offline-safe: idempotent by phone). Repeat visits bump
// visitCount + status RETURNED; first-timers get enrolled in the default
// VISITOR_REGISTERED workflow (pinned to its published version).
import { Injectable, NotFoundException } from '@nestjs/common';
import { appendAudit } from '@chms/db';
import { normalizeGhPhone, uuidv7, VisitorStatus } from '@chms/shared';
import { TenantService } from '../common/tenant';
import { resolveMemberBracket } from '../members/members.service';
import { AuthUser } from '../common/guards';

export interface RegisterVisitorInput {
  firstName: string;
  lastName?: string;
  phoneE164: string;
  dob?: string; // YYYY-MM-DD
  firstServiceId?: string;
  invitedByMemberId?: string;
  consentSms?: boolean;
  notes?: string;
}

@Injectable()
export class VisitorsService {
  constructor(private readonly tenant: TenantService) {}

  async register(user: AuthUser, input: RegisterVisitorInput, ip?: string) {
    const phone = normalizeGhPhone(input.phoneE164);
    return this.tenant.run(user, async (tx) => {
      const existing = await tx.visitor.findUnique({
        where: { churchId_phoneE164: { churchId: user.churchId, phoneE164: phone } },
      });

      if (existing) {
        const updated = await tx.visitor.update({
          where: { id: existing.id },
          data: {
            visitCount: { increment: 1 },
            status: existing.status === 'OPTED_OUT' ? 'OPTED_OUT' : 'RETURNED',
            firstName: input.firstName.trim(),
            lastName: input.lastName?.trim() || existing.lastName,
          },
        });
        await appendAudit(tx, {
          churchId: user.churchId,
          actorId: user.userId,
          action: 'visitor.return',
          entity: 'Visitor',
          entityId: existing.id,
          before: { visitCount: existing.visitCount, status: existing.status },
          after: { visitCount: updated.visitCount, status: updated.status },
          ip,
        });
        return { visitor: updated, isNew: false };
      }

      const { ageBracketId } = await resolveMemberBracket(tx, user.churchId, { dob: input.dob ?? null });
      const visitor = await tx.visitor.create({
        data: {
          churchId: user.churchId,
          firstName: input.firstName.trim(),
          lastName: input.lastName?.trim() || null,
          phoneE164: phone,
          ageBracketId,
          firstServiceId: input.firstServiceId ?? null,
          invitedByMemberId: input.invitedByMemberId ?? null,
          consentSms: input.consentSms ?? true,
          notes: input.notes ?? null,
          status: 'NEW',
        },
      });

      const workflow = await tx.followUpWorkflow.findFirst({
        where: { churchId: user.churchId, trigger: 'VISITOR_REGISTERED', isActive: true },
      });
      if (workflow) {
        const version = await tx.followUpWorkflowVersion.findFirst({
          where: { workflowId: workflow.id, isPublished: true },
          orderBy: { version: 'desc' },
        });
        if (version) {
          const firstStep = await tx.followUpStep.findFirst({
            where: { versionId: version.id },
            orderBy: { position: 'asc' },
          });
          await tx.followUpProgress.create({
            data: {
              churchId: user.churchId,
              workflowId: workflow.id,
              versionId: version.id,
              visitorId: visitor.id,
              state: 'ACTIVE',
              nextPosition: 0,
              nextRunAt: firstStep ? new Date(Date.now() + firstStep.delayMinutes * 60_000) : null,
            },
          });
          await tx.visitor.update({ where: { id: visitor.id }, data: { status: 'IN_FOLLOWUP' } });
          visitor.status = 'IN_FOLLOWUP';
        }
      }

      if (input.firstServiceId) {
        const existingAtt = await tx.attendance.findUnique({
          where: { serviceId_visitorId: { serviceId: input.firstServiceId, visitorId: visitor.id } },
        });
        if (!existingAtt) {
          await tx.attendance.create({
            data: {
              id: uuidv7(),
              churchId: user.churchId,
              serviceId: input.firstServiceId,
              visitorId: visitor.id,
              checkedInAt: new Date(),
              method: 'MANUAL',
            },
          });
        }
      }

      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: 'visitor.register',
        entity: 'Visitor',
        entityId: visitor.id,
        after: visitor,
        ip,
      });
      return { visitor, isNew: true };
    });
  }

  list(user: AuthUser, opts: { status?: VisitorStatus; q?: string } = {}) {
    return this.tenant.run(user, async (tx) => {
      const where: Record<string, unknown> = { churchId: user.churchId };
      if (opts.status) where.status = opts.status;
      if (opts.q) {
        where.OR = [
          { firstName: { contains: opts.q, mode: 'insensitive' } },
          { lastName: { contains: opts.q, mode: 'insensitive' } },
          { phoneE164: { contains: opts.q } },
        ];
      }
      return tx.visitor.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 });
    });
  }

  assign(user: AuthUser, visitorId: string, assigneeUserId: string, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const visitor = await tx.visitor.findFirst({ where: { id: visitorId, churchId: user.churchId } });
      if (!visitor) throw new NotFoundException('visitor not found');
      const updated = await tx.visitor.update({
        where: { id: visitorId },
        data: { assignedToUserId: assigneeUserId },
      });
      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: 'visitor.assign',
        entity: 'Visitor',
        entityId: visitorId,
        before: { assignedToUserId: visitor.assignedToUserId },
        after: { assignedToUserId: assigneeUserId },
        ip,
      });
      return updated;
    });
  }

  convert(user: AuthUser, visitorId: string, memberId: string, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const visitor = await tx.visitor.findFirst({ where: { id: visitorId, churchId: user.churchId } });
      if (!visitor) throw new NotFoundException('visitor not found');
      const member = await tx.member.findFirst({
        where: { id: memberId, churchId: user.churchId, deletedAt: null },
      });
      if (!member) throw new NotFoundException('member not found');
      const updated = await tx.visitor.update({
        where: { id: visitorId },
        data: { status: 'CONVERTED', convertedMemberId: memberId },
      });
      await tx.followUpProgress.updateMany({
        where: { visitorId, state: 'ACTIVE' },
        data: { state: 'CANCELLED', cancelReason: 'CONVERTED' },
      });
      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: 'visitor.convert',
        entity: 'Visitor',
        entityId: visitorId,
        after: { memberId, status: 'CONVERTED' },
        ip,
      });
      return updated;
    });
  }
}
