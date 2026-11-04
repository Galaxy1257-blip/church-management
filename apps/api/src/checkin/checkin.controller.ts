import { Body, Controller, Get, HttpCode, Post, Query, Req } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { ForModule, RequirePermissions } from '../common/decorators';
import { AuthedRequest } from '../common/guards';
import { CheckinService } from './checkin.service';

class CheckInDto {
  @IsString() serviceId!: string;
  @IsOptional() @IsString() memberId?: string;
  @IsOptional() @IsString() qrToken?: string;
  /** The member number the door team types (M00048). */
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() phoneE164?: string;
  @IsOptional() @IsIn(['MANUAL', 'QR', 'PHONE_LOOKUP']) method?: 'MANUAL' | 'QR' | 'PHONE_LOOKUP';
}

// Switched off in Settings → App sections means switched off here too.
@ForModule('worship')
@Controller('checkin')
export class CheckinController {
  constructor(private readonly checkin: CheckinService) {}

  @RequirePermissions('checkin:write')
  @Post()
  @HttpCode(200)
  checkIn(@Req() req: AuthedRequest, @Body() dto: CheckInDto) {
    return this.checkin.checkIn(req.user!, dto, req.ip);
  }

  @RequirePermissions('services:read')
  @Get()
  list(@Req() req: AuthedRequest, @Query('serviceId') serviceId: string) {
    return this.checkin.list(req.user!, serviceId);
  }
}
