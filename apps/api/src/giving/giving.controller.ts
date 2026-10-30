import {
  Body,
  Controller,
  Get,
  HttpCode,
  Headers,
  Inject,
  Post,
  Query,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import type { Request } from 'express';
import { Public, RequirePermissions } from '../common/decorators';
import { AuthedRequest } from '../common/guards';
import { BillingService } from '../billing/billing.service';
import { GivingService, paystackSecret, verifyPaystackSignature } from './giving.service';
import { Env } from '../env';

class QuoteDto {
  @IsString() fundId!: string;
  @IsInt() @Min(1) amountMinor!: number;
  @IsOptional() @IsBoolean() feeChoice?: boolean;
}

class InitializeDto extends QuoteDto {
  @IsOptional() @IsString() giverName?: string;
  @IsOptional() @IsString() giverPhoneE164?: string;
  @IsOptional() @IsBoolean() isAnonymous?: boolean;
  @IsOptional() @IsString() returnUrl?: string;
}

@Controller('giving')
export class GivingController {
  constructor(
    private readonly giving: GivingService,
    private readonly billing: BillingService,
    @Inject('ENV') private readonly env: Env,
  ) {}

  @RequirePermissions('giving:read')
  @Get('funds')
  funds(@Req() req: AuthedRequest) {
    return this.giving.funds(req.user!);
  }

  @RequirePermissions('giving:read')
  @Post('quote')
  @HttpCode(200)
  quote(@Req() req: AuthedRequest, @Body() dto: QuoteDto) {
    return this.giving.quote(req.user!, dto);
  }

  @RequirePermissions('giving:write')
  @Post('initialize')
  @HttpCode(200)
  initialize(@Req() req: AuthedRequest, @Body() dto: InitializeDto) {
    return this.giving.initialize(req.user!, dto, req.ip);
  }

  @RequirePermissions('giving:read')
  @Get('transactions')
  transactions(@Req() req: AuthedRequest, @Query('status') status?: string) {
    return this.giving.transactions(req.user!, { status });
  }

  @RequirePermissions('giving:read')
  @Get('funds/all')
  fundsAdmin(@Req() req: AuthedRequest) {
    return this.giving.fundsAdmin(req.user!);
  }

  @RequirePermissions('giving:write')
  @Post('funds')
  saveFund(@Req() req: AuthedRequest, @Body() dto: { id?: string; name: string; type: string; isActive?: boolean }) {
    return this.giving.saveFund(req.user!, dto, req.ip);
  }

  @RequirePermissions('finance:read')
  @Get('settings')
  feeSettings(@Req() req: AuthedRequest) {
    return this.giving.feeSettingsAdmin(req.user!);
  }

  @RequirePermissions('finance:approve')
  @Post('settings')
  saveFeeSettings(@Req() req: AuthedRequest, @Body() dto: any) {
    return this.giving.saveFeeSettings(req.user!, dto, req.ip);
  }

  /**
   * Paystack webhook: raw body + HMAC SHA512 signature. Public (Paystack has
   * no session) but cryptographically authenticated; a bad signature is 401.
   */
  @Public()
  @Post('webhooks/paystack')
  @HttpCode(200)
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature?: string,
  ) {
    const raw = req.rawBody;
    if (!raw) throw new UnauthorizedException('missing raw body');
    if (!verifyPaystackSignature(raw, signature, paystackSecret(this.env))) {
      throw new UnauthorizedException('invalid paystack signature');
    }
    const event = JSON.parse(raw.toString('utf8'));
    // One Paystack account, one webhook URL. Subscription charges use the
    // sub_ reference prefix so they reach the billing engine instead of giving.
    const reference = event?.data?.reference;
    if (typeof reference === 'string' && reference.startsWith('sub_')) {
      return this.billing.handlePaystackEvent(event);
    }
    return this.giving.handlePaystackEvent(event);
  }
}
