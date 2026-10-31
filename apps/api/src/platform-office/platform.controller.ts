import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Public } from '../common/decorators';
import { RateLimit, RateLimitGuard } from '../common/rate-limit';
import { PlatformActor, PlatformGuard, PlatformRequest } from './platform.guard';
import { PlatformService } from './platform.service';

class LoginDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(6) password!: string;
}

class CreateChurchDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(2) slug!: string;
  @IsString() @MinLength(2) adminName!: string;
  @IsString() adminPhoneE164!: string;
  @IsString() @MinLength(6) adminPassword!: string;
}

class UpdateChurchDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() pastorDisplayName?: string | null;
  @IsOptional() @IsObject() modules?: Record<string, boolean>;
  @IsOptional() @IsArray() @IsObject({ each: true }) customFeatures?: Record<string, unknown>[];
  @IsOptional() @IsInt() @Min(1) monthlyFeeMinor?: number;
  @IsOptional() @IsInt() @Min(1) @Max(28) billingDay?: number;
  @IsOptional() @IsInt() @Min(0) @Max(60) graceDays?: number;
  @IsOptional() @IsBoolean() billingExempt?: boolean;
  @IsOptional() @IsBoolean() billingLocked?: boolean;
  @IsOptional() @IsString() plan?: string;
  @IsOptional() @IsString() billingEmail?: string | null;
  @IsOptional() @IsString() billingPhone?: string | null;
  @IsOptional() @IsString() billingNote?: string | null;
}

class CreateUserDto {
  @IsString() churchId!: string;
  @IsString() @MinLength(2) name!: string;
  @IsString() phoneE164!: string;
  @IsString() @MinLength(6) password!: string;
  @IsOptional() @IsArray() roleKeys?: string[];
  @IsOptional() @IsString() careClassBracketId?: string | null;
  @IsOptional() @IsString() careClassSegment?: string | null;
}

class UpdateUserDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phoneE164?: string;
  @IsOptional() @IsString() email?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() careClassBracketId?: string | null;
  @IsOptional() @IsString() careClassSegment?: string | null;
}

class PasswordDto {
  @IsString() @MinLength(6) password!: string;
}

class RolesDto {
  @IsArray() roleKeys!: string[];
}

class CreateStaffDto {
  @IsString() @MinLength(2) name!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(10) password!: string;
  @IsOptional() @IsString() role?: string;
}

class UpdateStaffDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class StaffPasswordDto {
  @IsString() @MinLength(10) password!: string;
}

class ImportPreviewDto {
  @IsString() csvText!: string;
}

class ImportConfirmDto {
  @IsArray() rows!: Record<string, string>[];
}

/** Sign-in for OmniLabs staff. Separate audience, separate table, separate UI. */
@Controller('platform/auth')
@UseGuards(RateLimitGuard)
export class PlatformAuthController {
  constructor(private readonly platform: PlatformService) {}

  @Public()
  @RateLimit([
    { key: 'platform-login:ip', limit: 20, windowMs: 5 * 60_000 },
    { key: 'platform-login:email', limit: 8, windowMs: 5 * 60_000 },
  ])
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.platform.login(dto.email, dto.password);
  }

  @Public()
  @UseGuards(PlatformGuard)
  @Get('me')
  me(@Req() req: PlatformRequest) {
    return this.platform.me(req.platformUser!);
  }
}

/**
 * The support backend. Every route says @Public so the church guards skip it;
 * PlatformGuard is the only door, and it accepts audience "platform" tokens.
 */
@Controller('platform')
@Public()
@UseGuards(PlatformGuard)
export class PlatformOfficeController {
  constructor(private readonly platform: PlatformService) {}

  private actor(req: PlatformRequest): PlatformActor {
    // PlatformGuard has already rejected requests without a staff token.
    return req.platformUser!;
  }

  @Public()
  @Get('overview')
  overview() {
    return this.platform.overview();
  }

  @Public()
  @Get('churches')
  churches(@Query('q') q?: string) {
    return this.platform.listChurches(q);
  }

  @Public()
  @Post('churches')
  createChurch(@Req() req: PlatformRequest, @Body() dto: CreateChurchDto) {
    return this.platform.createChurch(this.actor(req), dto, req.ip);
  }

  @Public()
  @Get('churches/:id')
  church(@Param('id') id: string) {
    return this.platform.getChurch(id);
  }

  @Public()
  @Patch('churches/:id')
  updateChurch(@Req() req: PlatformRequest, @Param('id') id: string, @Body() dto: UpdateChurchDto) {
    return this.platform.updateChurch(this.actor(req), id, dto, req.ip);
  }

  @Public()
  @Get('users')
  users(@Query('churchId') churchId?: string) {
    return this.platform.listUsers(churchId);
  }

  @Public()
  @Post('users')
  createUser(@Req() req: PlatformRequest, @Body() dto: CreateUserDto) {
    return this.platform.createUser(this.actor(req), dto, req.ip);
  }

  @Public()
  @Patch('users/:id')
  updateUser(@Req() req: PlatformRequest, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.platform.updateUser(this.actor(req), id, dto, req.ip);
  }

  @Public()
  @Post('users/:id/password')
  @HttpCode(200)
  resetPassword(@Req() req: PlatformRequest, @Param('id') id: string, @Body() dto: PasswordDto) {
    return this.platform.resetPassword(this.actor(req), id, dto.password, req.ip);
  }

  @Public()
  @Post('users/:id/roles')
  @HttpCode(200)
  roles(@Req() req: PlatformRequest, @Param('id') id: string, @Body() dto: RolesDto) {
    return this.platform.setRoles(this.actor(req), id, dto.roleKeys, req.ip);
  }

  /** Opens a church as this user in a new tab (single-use 90s link). */
  @Public()
  @Post('users/:id/impersonate')
  @HttpCode(200)
  impersonate(@Req() req: PlatformRequest, @Param('id') id: string) {
    return this.platform.impersonate(this.actor(req), id, req.ip);
  }

  // ------------------------------------------------------------------ team
  @Public()
  @Get('staff')
  staff(@Req() req: PlatformRequest) {
    return this.platform.listStaff(this.actor(req));
  }

  @Public()
  @Post('staff')
  createStaff(@Req() req: PlatformRequest, @Body() dto: CreateStaffDto) {
    return this.platform.createStaff(this.actor(req), dto);
  }

  @Public()
  @Patch('staff/:id')
  updateStaff(@Req() req: PlatformRequest, @Param('id') id: string, @Body() dto: UpdateStaffDto) {
    return this.platform.updateStaff(this.actor(req), id, dto);
  }

  @Public()
  @Post('staff/:id/password')
  @HttpCode(200)
  staffPassword(@Req() req: PlatformRequest, @Param('id') id: string, @Body() dto: StaffPasswordDto) {
    return this.platform.resetStaffPassword(this.actor(req), id, dto.password);
  }

  // ------------------------------------------------------------ member import
  @Public()
  @Post('churches/:id/members/preview')
  @HttpCode(200)
  previewMembers(@Param('id') id: string, @Body() dto: ImportPreviewDto) {
    return this.platform.previewMembers(id, dto.csvText);
  }

  @Public()
  @Post('churches/:id/members/confirm')
  @HttpCode(200)
  confirmMembers(@Req() req: PlatformRequest, @Param('id') id: string, @Body() dto: ImportConfirmDto) {
    return this.platform.confirmMembers(this.actor(req), id, dto.rows as never, req.ip);
  }

  @Public()
  @Get('payments')
  payments(@Query('status') status?: string) {
    return this.platform.listPayments(status);
  }

  @Public()
  @Post('payments/:id/confirm')
  @HttpCode(200)
  confirmPayment(@Req() req: PlatformRequest, @Param('id') id: string) {
    return this.platform.confirmPayment(this.actor(req), id, req.ip);
  }

  @Public()
  @Post('payments/:id/cancel')
  @HttpCode(200)
  cancelPayment(@Req() req: PlatformRequest, @Param('id') id: string) {
    return this.platform.cancelPayment(this.actor(req), id, req.ip);
  }
}
