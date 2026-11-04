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

/**
 * The door is not the Services screen. A church that switched Services off hides
 * the service list and the attendance screen, but the people standing at the door
 * still have to count who came in — so only the read of the *attendance list*
 * stays inside the section. `checkin:write` is the gate on everything else here.
 */
@Controller('checkin')
export class CheckinController {
  constructor(private readonly checkin: CheckinService) {}

  /** The Sunday to check people into, and who is already in. */
  @RequirePermissions('checkin:write')
  @Get('setup')
  setup(@Req() req: AuthedRequest) {
    return this.checkin.doorSetup(req.user!);
  }

  /** Name, member number or phone typed at the door — the usher helps them in. */
  @RequirePermissions('checkin:write')
  @Get('find')
  find(@Req() req: AuthedRequest, @Query('q') q = '', @Query('serviceId') serviceId?: string) {
    return this.checkin.find(req.user!, q, serviceId);
  }

  @RequirePermissions('checkin:write')
  @Post()
  @HttpCode(200)
  checkIn(@Req() req: AuthedRequest, @Body() dto: CheckInDto) {
    return this.checkin.checkIn(req.user!, dto, req.ip);
  }

  @ForModule('worship')
  @RequirePermissions('services:read')
  @Get()
  list(@Req() req: AuthedRequest, @Query('serviceId') serviceId: string) {
    return this.checkin.list(req.user!, serviceId);
  }
}
