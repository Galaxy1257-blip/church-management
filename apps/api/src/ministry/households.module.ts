// Households: unified family linking (head/spouse/child/other).
import { Body, Controller, Get, Injectable, Module, Param, Post, Req } from '@nestjs/common';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { RequirePermissions } from '../common/decorators';
import { AuthedRequest, AuthUser } from '../common/guards';
import { TenantService } from '../common/tenant';

class HouseholdDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() headMemberId?: string;
}

@Injectable()
export class HouseholdsService {
  constructor(private readonly tenant: TenantService) {}

  list(user: AuthUser) {
    return this.tenant.run(user, (tx) =>
      tx.household.findMany({
        where: { churchId: user.churchId },
        include: { members: { include: { member: { select: { id: true, firstName: true, lastName: true } } } } },
      }),
    );
  }

  create(user: AuthUser, input: HouseholdDto, _ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const h = await tx.household.create({
        data: { churchId: user.churchId, name: input.name, address: input.address ?? null },
      });
      if (input.headMemberId) {
        await tx.householdMember.create({
          data: { householdId: h.id, memberId: input.headMemberId, relation: 'HEAD' },
        });
      }
      return h;
    });
  }

  link(user: AuthUser, householdId: string, memberId: string, relation: string) {
    return this.tenant.run(user, (tx) =>
      tx.householdMember.upsert({
        where: { householdId_memberId: { householdId, memberId } },
        create: { householdId, memberId, relation },
        update: { relation },
      }),
    );
  }
}

@Controller('households')
export class HouseholdsController {
  constructor(private readonly svc: HouseholdsService) {}

  @RequirePermissions('members:read')
  @Get()
  list(@Req() req: AuthedRequest) {
    return this.svc.list(req.user!);
  }

  @RequirePermissions('members:write')
  @Post()
  create(@Req() req: AuthedRequest, @Body() dto: HouseholdDto) {
    return this.svc.create(req.user!, dto, req.ip);
  }

  @RequirePermissions('members:write')
  @Post(':id/link')
  link(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: { memberId: string; relation: string }) {
    return this.svc.link(req.user!, id, body.memberId, body.relation);
  }
}

@Module({
  providers: [TenantService, HouseholdsService],
  controllers: [HouseholdsController],
})
export class HouseholdsModule {}
