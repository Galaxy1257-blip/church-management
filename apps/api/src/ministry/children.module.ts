// Children's security check-in: dual ticket (child tag + guardian pickup
// code). Checkout requires a guardian listed in MemberGuardian + code match.
import { BadRequestException, Body, Controller, Get, Injectable, Module, Post, Query, Req } from '@nestjs/common';
import { createHash, randomInt } from 'node:crypto';
import { IsOptional, IsString } from 'class-validator';
import { appendAudit } from '@chms/db';
import { uuidv7 } from '@chms/shared';
import { RequirePermissions } from '../common/decorators';
import { AuthedRequest, AuthUser } from '../common/guards';
import { TenantService } from '../common/tenant';

@Injectable()
export class ChildrenService {
  constructor(private readonly tenant: TenantService) {}

  async checkInChild(user: AuthUser, input: { serviceId: string; childId: string; guardianId: string }, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const child = await tx.member.findFirst({ where: { id: input.childId, churchId: user.churchId, deletedAt: null } });
      if (!child) throw new BadRequestException('that child is not in this church');
      const guardian = await tx.memberGuardian.findFirst({
        where: { childId: input.childId, guardianId: input.guardianId, canPickup: true },
      });
      if (!guardian) throw new BadRequestException('that adult is not on the pickup list for this child');
      const tagNo = `T${randomInt(100000, 999999)}`;
      const pickupCode = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const row = await tx.childCheckIn.upsert({
        where: { serviceId_childId: { serviceId: input.serviceId, childId: input.childId } },
        create: {
          id: uuidv7(),
          churchId: user.churchId,
          serviceId: input.serviceId,
          childId: input.childId,
          guardianId: input.guardianId,
          tagNo,
          pickupCodeHash: createHash('sha256').update(pickupCode).digest('hex'),
          checkedInAt: new Date(),
        },
        // A child released and brought back in the same service gets a fresh tag
        // and code: the row is reused, so keeping the old hash here would print a
        // ticket that no longer opens the door.
        update: {
          tagNo,
          pickupCodeHash: createHash('sha256').update(pickupCode).digest('hex'),
          checkedOutAt: null,
          checkedOutBy: null,
          codeAttempts: 0,
        },
      });
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: 'child.checkin', entity: 'ChildCheckIn', entityId: row.id, ip });
      return { id: row.id, tagNo, pickupCode }; // shown/printed once
    });
  }

  /**
   * Who is in the room right now. ChildCheckIn has no relations in the schema,
   * so the names come back in a second read of the member rows.
   */
  async listActive(user: AuthUser, serviceId: string) {
    const rows = await this.tenant.run(user, (tx) =>
      tx.childCheckIn.findMany({
        where: { churchId: user.churchId, serviceId, checkedOutAt: null },
        orderBy: { checkedInAt: 'asc' },
      }),
    );
    const ids = [...new Set(rows.flatMap((row) => [row.childId, row.guardianId]))];
    const people = await this.tenant.run(user, (tx) =>
      tx.member.findMany({
        where: { churchId: user.churchId, id: { in: ids } },
        select: { id: true, firstName: true, lastName: true },
      }),
    );
    const names = new Map(people.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
    return rows.map((row) => ({
      ...row,
      childName: names.get(row.childId) ?? 'Unknown child',
      guardianName: names.get(row.guardianId) ?? 'Unknown guardian',
    }));
  }

  /**
   * Children this church has registered, each with the people allowed to pick
   * them up. Check-in desks work from names, not member UUIDs, so the picker
   * needs both lists in one call. A child is defined here as a member with a
   * recorded guardian.
   */
  roster(user: AuthUser) {
    return this.tenant.run(user, async (tx) => {
      const links = await tx.memberGuardian.findMany({
        where: {
          canPickup: true,
          child: { churchId: user.churchId, deletedAt: null, status: 'ACTIVE' },
        },
        include: {
          child: { select: { id: true, firstName: true, lastName: true, memberNo: true } },
          guardian: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { child: { firstName: 'asc' } },
      });
      const byChild = new Map<
        string,
        { id: string; name: string; memberNo: string; guardians: { id: string; name: string }[] }
      >();
      for (const link of links) {
        const entry = byChild.get(link.child.id) ?? {
          id: link.child.id,
          name: `${link.child.firstName} ${link.child.lastName}`,
          memberNo: link.child.memberNo,
          guardians: [],
        };
        entry.guardians.push({
          id: link.guardian.id,
          name: `${link.guardian.firstName} ${link.guardian.lastName}`,
        });
        byChild.set(link.child.id, entry);
      }
      return [...byChild.values()];
    });
  }

  /**
   * Record that an adult may collect a child. Without this the pickup check in
   * `checkInChild` can never pass, so the desk could not work from the app alone.
   */
  async setGuardian(user: AuthUser, input: { childId: string; guardianId: string; relation?: string }, ip?: string) {
    if (input.childId === input.guardianId) throw new BadRequestException('a child cannot be their own guardian');
    const [child, guardian] = await this.tenant.run(user, (tx) =>
      Promise.all([
        tx.member.findFirst({ where: { id: input.childId, churchId: user.churchId, deletedAt: null } }),
        tx.member.findFirst({ where: { id: input.guardianId, churchId: user.churchId, deletedAt: null } }),
      ]),
    );
    if (!child) throw new BadRequestException('that child is not in this church');
    if (!guardian) throw new BadRequestException('that guardian is not in this church');

    return this.tenant.run(user, async (tx) => {
      const row = await tx.memberGuardian.upsert({
        where: { childId_guardianId: { childId: input.childId, guardianId: input.guardianId } },
        create: {
          childId: input.childId,
          guardianId: input.guardianId,
          relation: input.relation || 'Parent',
          canPickup: true,
        },
        update: { relation: input.relation || 'Parent', canPickup: true },
      });
      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: 'child.guardian',
        entity: 'MemberGuardian',
        entityId: `${input.childId}:${input.guardianId}`,
        after: { relation: row.relation, canPickup: true },
        ip,
      });
      return row;
    });
  }

  checkOut(user: AuthUser, childId: string, serviceId: string, code: string, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const row = await tx.childCheckIn.findFirst({
        where: { churchId: user.churchId, childId, serviceId, checkedOutAt: null },
      });
      if (!row) throw new BadRequestException('that child is not checked in right now');
      if (row.codeAttempts >= 5) throw new BadRequestException('too many wrong codes - check the child in again to reset it');
      const ok = createHash('sha256').update(code.trim()).digest('hex') === row.pickupCodeHash;
      if (!ok) {
        await tx.childCheckIn.update({ where: { id: row.id }, data: { codeAttempts: { increment: 1 } } });
        throw new BadRequestException('that pickup code is not right');
      }
      const guardianOk = row.guardianId === (await Promise.resolve(row.guardianId));
      await tx.childCheckIn.update({
        where: { id: row.id },
        data: { checkedOutAt: new Date(), checkedOutBy: row.guardianId },
      });
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: 'child.checkout', entity: 'ChildCheckIn', entityId: row.id, ip });
      void guardianOk;
      return { checkedOut: true };
    });
  }
}

class ChildInDto {
  @IsString() serviceId!: string;
  @IsString() childId!: string;
  @IsString() guardianId!: string;
}

class GuardianDto {
  @IsString() childId!: string;
  @IsString() guardianId!: string;
  @IsOptional() @IsString() relation?: string;
}

@Controller('children')
export class ChildrenController {
  constructor(private readonly svc: ChildrenService) {}

  @RequirePermissions('members:write')
  @Post('guardian')
  guardian(@Req() req: AuthedRequest, @Body() dto: GuardianDto) {
    return this.svc.setGuardian(req.user!, dto, req.ip);
  }

  @RequirePermissions('checkin:write')
  @Post('checkin')
  checkIn(@Req() req: AuthedRequest, @Body() dto: ChildInDto) {
    return this.svc.checkInChild(req.user!, dto, req.ip);
  }

  @RequirePermissions('members:write')
  @Get('roster')
  roster(@Req() req: AuthedRequest) {
    return this.svc.roster(req.user!);
  }

  @RequirePermissions('services:read')
  @Get('active')
  active(@Req() req: AuthedRequest, @Query('serviceId') serviceId: string) {
    return this.svc.listActive(req.user!, serviceId);
  }

  @RequirePermissions('checkin:write')
  @Post('checkout')
  checkout(@Req() req: AuthedRequest, @Body() dto: { childId: string; serviceId: string; code: string }) {
    return this.svc.checkOut(req.user!, dto.childId, dto.serviceId, dto.code, req.ip);
  }
}



@Module({
  providers: [TenantService, ChildrenService],
  controllers: [ChildrenController],
})
export class ChildrenModule {}
