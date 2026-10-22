// Volunteer roster: assign shifts, YES/NO confirmation, swap/backup.
import { Body, Controller, Get, Injectable, Module, Param, Post, Query, Req } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { appendAudit } from '@chms/db';
import { RequirePermissions } from '../common/decorators';
import { AuthedRequest, AuthUser } from '../common/guards';
import { TenantService } from '../common/tenant';

class ShiftDto {
  @IsString() serviceId!: string;
  @IsString() groupId!: string;
  @IsString() memberId!: string;
  @IsString() @MinLength(1) duty!: string;
}

@Injectable()
export class RosterService {
  constructor(private readonly tenant: TenantService) {}

  list(user: AuthUser, serviceId: string) {
    return this.tenant.run(user, (tx) =>
      tx.rosterShift.findMany({ where: { churchId: user.churchId, serviceId }, take: 500 }),
    );
  }

  assign(user: AuthUser, input: ShiftDto, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const row = await tx.rosterShift.upsert({
        where: { serviceId_memberId_duty: { serviceId: input.serviceId, memberId: input.memberId, duty: input.duty } },
        create: { churchId: user.churchId, ...input, status: 'ASSIGNED' },
        update: { groupId: input.groupId, status: 'ASSIGNED' },
      });
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: 'roster.assign', entity: 'RosterShift', entityId: row.id, after: row, ip });
      return row;
    });
  }

  /** memberId claims/declines their own shift (member acting via leader). */
  respond(user: AuthUser, shiftId: string, status: 'CONFIRMED' | 'DECLINED') {
    return this.tenant.run(user, async (tx) => {
      const row = await tx.rosterShift.findFirst({ where: { id: shiftId, churchId: user.churchId } });
      if (!row) throw new Error('shift not found');
      return tx.rosterShift.update({ where: { id: shiftId }, data: { status } });
    });
  }
}

@Controller('roster')
export class RosterController {
  constructor(private readonly svc: RosterService) {}

  @RequirePermissions('services:read')
  @Get()
  list(@Req() req: AuthedRequest, @Query('serviceId') serviceId: string) {
    return this.svc.list(req.user!, serviceId);
  }

  @RequirePermissions('members:write')
  @Post()
  assign(@Req() req: AuthedRequest, @Body() dto: ShiftDto) {
    return this.svc.assign(req.user!, dto, req.ip);
  }

  @RequirePermissions('members:write')
  @Post(':id/respond')
  respond(@Req() req: AuthedRequest, @Param('id') id: string, @Body('status') status: 'CONFIRMED' | 'DECLINED') {
    return this.svc.respond(req.user!, id, status);
  }
}


@Module({
  providers: [TenantService, RosterService],
  controllers: [RosterController],
})
export class RosterModule {}
