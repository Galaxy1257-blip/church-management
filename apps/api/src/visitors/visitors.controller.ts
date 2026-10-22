import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';
import { VisitorStatus } from '@chms/shared';
import { RequirePermissions } from '../common/decorators';
import { AuthedRequest } from '../common/guards';
import { VisitorsService } from './visitors.service';

class RegisterVisitorDto {
  @IsString() @MinLength(1) firstName!: string;
  @IsOptional() @IsString() lastName?: string;
  @IsString() phoneE164!: string;
  @IsOptional() @IsString() dob?: string; // YYYY-MM-DD
  @IsOptional() @IsString() firstServiceId?: string;
  @IsOptional() @IsString() invitedByMemberId?: string;
  @IsOptional() @IsBoolean() consentSms?: boolean;
  @IsOptional() @IsString() notes?: string;
}

@Controller('visitors')
export class VisitorsController {
  constructor(private readonly visitors: VisitorsService) {}

  /** Offline-safe: register is idempotent by (church, phone). */
  @RequirePermissions('visitors:write')
  @Post('register')
  register(@Req() req: AuthedRequest, @Body() dto: RegisterVisitorDto) {
    return this.visitors.register(req.user!, dto, req.ip);
  }

  @RequirePermissions('visitors:read')
  @Get()
  list(@Req() req: AuthedRequest, @Query('status') status?: VisitorStatus, @Query('q') q?: string) {
    return this.visitors.list(req.user!, { status, q });
  }

  @RequirePermissions('visitors:write')
  @Post(':id/assign')
  assign(@Req() req: AuthedRequest, @Param('id') id: string, @Body('userId') userId: string) {
    return this.visitors.assign(req.user!, id, userId, req.ip);
  }

  @RequirePermissions('visitors:write')
  @Post(':id/convert')
  convert(@Req() req: AuthedRequest, @Param('id') id: string, @Body('memberId') memberId: string) {
    return this.visitors.convert(req.user!, id, memberId, req.ip);
  }
}
