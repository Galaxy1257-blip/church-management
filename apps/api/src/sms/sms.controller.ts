import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { RequirePermissions } from '../common/decorators';
import { AuthedRequest } from '../common/guards';
import { CampaignAudience, SmsService } from './sms.service';

class CampaignDto {
  @IsString() @MinLength(1) name!: string;
  @IsString() @MinLength(1) body!: string;
  @IsObject() audience!: CampaignAudience;
  @IsOptional() @IsString() scheduledAt?: string;
}

class PreviewDto {
  @IsString() body!: string;
  @IsOptional() @IsObject() audience?: CampaignAudience;
}

@Controller('sms')
export class SmsController {
  constructor(private readonly sms: SmsService) {}

  @RequirePermissions('sms:read')
  @Get('wallet')
  wallet(@Req() req: AuthedRequest) {
    return this.sms.wallet(req.user!);
  }

  @RequirePermissions('sms:read')
  @Get('packages')
  packages() {
    return this.sms.packages();
  }

  @RequirePermissions('sms:read')
  @Get('ledger')
  ledger(@Req() req: AuthedRequest, @Query('limit') limit?: string) {
    return this.sms.ledger(req.user!, limit ? Number(limit) : undefined);
  }

  @RequirePermissions('sms:read')
  @Get('logs')
  logs(@Req() req: AuthedRequest, @Query('limit') limit?: string) {
    return this.sms.logs(req.user!, limit ? Number(limit) : undefined);
  }

  @RequirePermissions('sms:read')
  @Get('opt-outs')
  optOuts(@Req() req: AuthedRequest) {
    return this.sms.optOuts(req.user!);
  }

  @RequirePermissions('sms:send')
  @Delete('opt-outs/:phone')
  @HttpCode(200)
  removeOptOut(@Req() req: AuthedRequest, @Param('phone') phone: string) {
    return this.sms.removeOptOut(req.user!, phone, req.ip);
  }

  @RequirePermissions('campaigns:read')
  @Get('campaigns')
  campaigns(@Req() req: AuthedRequest) {
    return this.sms.campaigns(req.user!);
  }

  @RequirePermissions('campaigns:write')
  @Post('campaigns/preview')
  @HttpCode(200)
  preview(@Req() req: AuthedRequest, @Body() dto: PreviewDto) {
    return this.sms.previewCampaign(req.user!, { body: dto.body, audience: dto.audience ?? {} });
  }

  @RequirePermissions('campaigns:write')
  @Post('campaigns')
  create(@Req() req: AuthedRequest, @Body() dto: CampaignDto) {
    return this.sms.createCampaign(req.user!, dto, req.ip);
  }

  @RequirePermissions('campaigns:write')
  @Post('campaigns/:id/send')
  @HttpCode(200)
  send(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.sms.sendCampaign(req.user!, id, req.ip);
  }
}
