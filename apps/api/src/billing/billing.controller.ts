import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { Authenticated, BillingExempt, RequirePermissions } from '../common/decorators';
import { AuthedRequest } from '../common/guards';
import { BillingService } from './billing.service';

class ClaimCashDto {
  @IsOptional() @IsIn(['CASH', 'TRANSFER']) method?: 'CASH' | 'TRANSFER';
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsString() payerName?: string;
}

@Controller('billing')
@BillingExempt()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** Every signed-in user needs this for the lock screen; it is not money data. */
  @Authenticated()
  @Get('status')
  status(@Req() req: AuthedRequest) {
    return this.billing.status(req.user!);
  }

  @RequirePermissions('settings:write')
  @Get('payments')
  history(@Req() req: AuthedRequest) {
    return this.billing.history(req.user!);
  }

  @RequirePermissions('settings:write')
  @Post('checkout')
  @HttpCode(200)
  checkout(@Req() req: AuthedRequest) {
    return this.billing.checkout(req.user!, req.ip);
  }

  /** The church says it paid in cash; the platform office confirms it. */
  @RequirePermissions('settings:write')
  @Post('claim')
  @HttpCode(200)
  claim(@Req() req: AuthedRequest, @Body() dto: ClaimCashDto) {
    return this.billing.claimCash(req.user!, dto, req.ip);
  }
}
