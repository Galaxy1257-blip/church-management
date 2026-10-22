// Pledges & capital campaigns. Pledges are intentions, never money;
// progress always comes from Transaction (ground rule 1).
import { Body, Controller, Get, Injectable, Module, Post, Query, Req } from '@nestjs/common';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { appendAudit } from '@chms/db';
import { RequirePermissions } from '../common/decorators';
import { AuthedRequest, AuthUser } from '../common/guards';
import { TenantService } from '../common/tenant';

class CampaignDto {
  @IsString() fundId!: string;
  @IsString() @MinLength(1) name!: string;
  @IsInt() @Min(1) goalMinor!: number;
  @IsString() startsOn!: string;
  @IsOptional() @IsString() endsOn?: string;
  @IsOptional() @IsBoolean() isPublic?: boolean;
}
class PledgeDto {
  @IsString() memberId!: string;
  @IsString() fundId!: string;
  @IsOptional() @IsString() campaignId?: string;
  @IsInt() @Min(1) amountMinor!: number;
  @IsOptional() @IsIn(['ONE_TIME', 'WEEKLY', 'MONTHLY']) frequency?: 'ONE_TIME' | 'WEEKLY' | 'MONTHLY';
  @IsString() startsOn!: string;
}

@Injectable()
export class PledgesService {
  constructor(private readonly tenant: TenantService) {}

  campaigns(user: AuthUser) {
    return this.tenant.run(user, async (tx) => {
      const rows = await tx.campaign.findMany({ where: { churchId: user.churchId } });
      const withProgress = await Promise.all(
        rows.map(async (c) => {
          const sum = await tx.transaction.aggregate({
            where: { churchId: user.churchId, fundId: c.fundId, status: 'SUCCESS', paidAt: { gte: c.startsOn } },
            _sum: { giftMinor: true },
          });
          const pledged = await tx.pledge.aggregate({
            where: { churchId: user.churchId, campaignId: c.id, status: 'ACTIVE' },
            _sum: { amountMinor: true },
          });
          return {
            ...c,
            raisedMinor: sum._sum.giftMinor ?? 0,
            pledgedMinor: pledged._sum.amountMinor ?? 0,
          };
        }),
      );
      return withProgress;
    });
  }

  createCampaign(user: AuthUser, input: CampaignDto, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const c = await tx.campaign.create({
        data: {
          churchId: user.churchId,
          fundId: input.fundId,
          name: input.name,
          goalMinor: input.goalMinor,
          startsOn: new Date(input.startsOn),
          endsOn: input.endsOn ? new Date(input.endsOn) : null,
          isPublic: input.isPublic ?? true,
        },
      });
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: 'campaign.create', entity: 'Campaign', entityId: c.id, after: c, ip });
      return c;
    });
  }

  pledges(user: AuthUser, memberId?: string) {
    return this.tenant.run(user, (tx) =>
      tx.pledge.findMany({
        where: { churchId: user.churchId, ...(memberId ? { memberId } : {}) },
        include: { fund: { select: { name: true } } },
        orderBy: { startsOn: 'desc' },
        take: 200,
      }),
    );
  }

  createPledge(user: AuthUser, input: PledgeDto, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const p = await tx.pledge.create({
        data: {
          churchId: user.churchId,
          memberId: input.memberId,
          fundId: input.fundId,
          campaignId: input.campaignId ?? null,
          amountMinor: input.amountMinor,
          frequency: input.frequency ?? 'ONE_TIME',
          startsOn: new Date(input.startsOn),
        },
      });
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: 'pledge.create', entity: 'Pledge', entityId: p.id, after: p, ip });
      return p;
    });
  }
}

@Controller()
export class PledgesController {
  constructor(private readonly svc: PledgesService) {}

  @RequirePermissions('giving:read')
  @Get('campaigns')
  campaigns(@Req() req: AuthedRequest) {
    return this.svc.campaigns(req.user!);
  }

  @RequirePermissions('giving:write')
  @Post('campaigns')
  createCampaign(@Req() req: AuthedRequest, @Body() dto: CampaignDto) {
    return this.svc.createCampaign(req.user!, dto, req.ip);
  }

  @RequirePermissions('giving:read')
  @Get('pledges')
  pledges(@Req() req: AuthedRequest, @Query('memberId') memberId?: string) {
    return this.svc.pledges(req.user!, memberId);
  }

  @RequirePermissions('giving:write')
  @Post('pledges')
  createPledge(@Req() req: AuthedRequest, @Body() dto: PledgeDto) {
    return this.svc.createPledge(req.user!, dto, req.ip);
  }
}



@Module({
  providers: [TenantService, PledgesService],
  controllers: [PledgesController],
})
export class PledgesModule {}
