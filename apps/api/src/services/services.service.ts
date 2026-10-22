// Services: Sunday service instances (from templates), open/close lifecycle.
// The worker materialises template instances ahead of time; this module also
// allows manual creation (joint services, special events).
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { appendAudit } from '@chms/db';
import { ServiceStatus } from '@chms/shared';
import { TenantService } from '../common/tenant';
import { AuthUser } from '../common/guards';

@Injectable()
export class ServicesService {
  constructor(private readonly tenant: TenantService) {}

  list(user: AuthUser, opts: { from?: string; to?: string } = {}) {
    return this.tenant.run(user, async (tx) => {
      const where: Record<string, unknown> = { churchId: user.churchId };
      if (opts.from || opts.to) {
        where.startsAt = {
          ...(opts.from ? { gte: new Date(opts.from) } : {}),
          ...(opts.to ? { lte: new Date(opts.to) } : {}),
        };
      }
      return tx.service.findMany({ where, orderBy: { startsAt: 'desc' }, take: 200 });
    });
  }

  getOne(user: AuthUser, id: string) {
    return this.tenant.run(user, async (tx) => {
      const svc = await tx.service.findFirst({ where: { id, churchId: user.churchId } });
      if (!svc) throw new NotFoundException('service not found');
      return svc;
    });
  }

  create(
    user: AuthUser,
    input: { name: string; startsAt: string; branchId?: string; templateId?: string },
    ip?: string,
  ) {
    return this.tenant.run(user, async (tx) => {
      const svc = await tx.service.create({
        data: {
          churchId: user.churchId,
          branchId: input.branchId ?? null,
          templateId: input.templateId ?? null,
          name: input.name,
          startsAt: new Date(input.startsAt),
          status: 'SCHEDULED',
        },
      });
      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: 'service.create',
        entity: 'Service',
        entityId: svc.id,
        after: svc,
        ip,
      });
      return svc;
    });
  }

  setStatus(user: AuthUser, id: string, status: ServiceStatus, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const svc = await tx.service.findFirst({ where: { id, churchId: user.churchId } });
      if (!svc) throw new NotFoundException('service not found');
      if (svc.status === 'CLOSED' && status !== 'CLOSED') {
        throw new BadRequestException('a closed service cannot be reopened');
      }
      const updated = await tx.service.update({
        where: { id },
        data: { status, closedAt: status === 'CLOSED' ? new Date() : null },
      });
      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: `service.${status.toLowerCase()}`,
        entity: 'Service',
        entityId: id,
        before: { status: svc.status },
        after: { status: updated.status },
        ip,
      });
      return updated;
    });
  }

  templates(user: AuthUser) {
    return this.tenant.run(user, (tx) =>
      tx.serviceTemplate.findMany({ where: { churchId: user.churchId }, orderBy: { name: 'asc' } }),
    );
  }
}
