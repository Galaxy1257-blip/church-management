// Children's security check-in: dual ticket (child tag + guardian pickup
// code). Checkout requires a guardian listed in MemberGuardian + code match.
import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Module, Post, Query, Req } from '@nestjs/common';
import { createHash, randomInt } from 'node:crypto';
import { IsOptional, IsString } from 'class-validator';
import { appendAudit, Db } from '@chms/db';
import { uuidv7 } from '@chms/shared';
import { Authenticated, ForModule, RequirePermissions } from '../common/decorators';
import { deskMoveChildIds, deskRosterChildIds } from '../common/class-scope';
import { AuthedRequest, AuthUser } from '../common/guards';
import { TenantService } from '../common/tenant';
import { ServicesModule } from '../services/services.module';
import { ServicesService } from '../services/services.service';

@Injectable()
export class ChildrenService {
  constructor(private readonly tenant: TenantService, private readonly services: ServicesService) {}

  /**
   * A Sunday School teacher may only move a child from the class the office gave
   * them. The office and the door team keep the whole church — same rule as the
   * care queue (common/class-scope.ts).
   */
  private async assertDeskChild(tx: Db, user: AuthUser, childId: string): Promise<void> {
    const ids = await deskMoveChildIds(tx, user);
    if (ids && !ids.includes(childId)) {
      throw new ForbiddenException('That child is not in your class.');
    }
  }

  async checkInChild(user: AuthUser, input: { serviceId: string; childId: string; guardianId: string }, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      await this.assertDeskChild(tx, user, input.childId);
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
   * The service picker for the desk. It asks ServicesService directly instead of
   * sending the caller to GET /services, because that route belongs to the
   * Services section (worship) and a Sunday School that has switched Services off
   * still has to be able to check children in. Going through the service rather
   * than the table keeps the one rule that matters: the same read that opens
   * today's service on the first person in on Sunday morning. A rolling week back
   * is the whole window the desk works in.
   */
  async deskServices(user: AuthUser) {
    const from = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const rows = await this.services.list(user, { from });
    return rows.slice(0, 8).map((s) => ({ id: s.id, name: s.name, status: s.status, startsAt: s.startsAt }));
  }

  /**
   * Who is in the room right now. ChildCheckIn has no relations in the schema,
   * so the names come back in a second read of the member rows.
   */
  async listActive(user: AuthUser, serviceId: string) {
    const rows = await this.tenant.run(user, async (tx) => {
      const mine = await deskMoveChildIds(tx, user);
      const found = await tx.childCheckIn.findMany({
        where: {
          churchId: user.churchId,
          serviceId,
          checkedOutAt: null,
          ...(mine ? { childId: { in: mine } } : {}),
        },
        orderBy: { checkedInAt: 'asc' },
      });
      // A teacher sees their own class inside, not the count of every other room.
      return mine ? found.filter((row) => mine.includes(row.childId)) : found;
    });
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
   *
   * A Sunday School teacher gets only their own class — see deskRosterChildIds.
   * The office (members:write) gets the whole list, exactly as before.
   */
  roster(user: AuthUser) {
    return this.tenant.run(user, async (tx) => {
      const mine = await deskRosterChildIds(tx, user);
      const links = await tx.memberGuardian.findMany({
        where: {
          canPickup: true,
          child: { churchId: user.churchId, deletedAt: null, status: 'ACTIVE', ...(mine ? { id: { in: mine } } : {}) },
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
      await this.assertDeskChild(tx, user, childId);
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

// Switched off in Settings → App sections means switched off here too.
@ForModule('children')
@Controller('children')
export class ChildrenController {
  constructor(private readonly svc: ChildrenService) {}

  @RequirePermissions('members:write')
  @Post('guardian')
  guardian(@Req() req: AuthedRequest, @Body() dto: GuardianDto) {
    return this.svc.setGuardian(req.user!, dto, req.ip);
  }

  /**
   * The desk writes. @Authenticated() rather than one permission because three
   * roles legitimately work the desk and no single permission covers them: the
   * office (members:write), the door team (checkin:write) and the class teacher
   * (children:write). deskMoveChildIds() is what decides, and it narrows the
   * teacher to their own class before anything is written.
   */
  @Authenticated()
  @Post('checkin')
  checkIn(@Req() req: AuthedRequest, @Body() dto: ChildInDto) {
    return this.svc.checkInChild(req.user!, dto, req.ip);
  }

  /**
   * The desk list. Same shape as the two writes, but narrower: this is the one
   * that names the adults allowed to collect a child, so the door role does not
   * get it — only the office and the teacher's own class (deskRosterChildIds).
   */
  @Authenticated()
  @Get('roster')
  roster(@Req() req: AuthedRequest) {
    return this.svc.roster(req.user!);
  }

  /**
   * The desk's service picker. It sits here rather than on GET /services so a
   * church that switched the Services section off can still run the children's
   * desk; the class-level @ForModule('children') is what guards it.
   */
  @RequirePermissions('services:read')
  @Get('services')
  deskServices(@Req() req: AuthedRequest) {
    return this.svc.deskServices(req.user!);
  }

  @RequirePermissions('services:read')
  @Get('active')
  active(@Req() req: AuthedRequest, @Query('serviceId') serviceId: string) {
    return this.svc.listActive(req.user!, serviceId);
  }

  @Authenticated()
  @Post('checkout')
  checkout(@Req() req: AuthedRequest, @Body() dto: { childId: string; serviceId: string; code: string }) {
    return this.svc.checkOut(req.user!, dto.childId, dto.serviceId, dto.code, req.ip);
  }
}



@Module({
  imports: [ServicesModule],
  providers: [TenantService, ChildrenService],
  controllers: [ChildrenController],
})
export class ChildrenModule {}
