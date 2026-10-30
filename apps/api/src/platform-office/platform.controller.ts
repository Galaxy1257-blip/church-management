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
}

class UpdateUserDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phoneE164?: string;
  @IsOptional() @IsString() email?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class PasswordDto {
  @IsString() @MinLength(6) password!: string;
}

class RolesDto {
  @IsArray() roleKeys!: string[];
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

  @Get('overview')
  overview() {
    return this.platform.overview();
  }

  @Get('churches')
  churches(@Query('q') q?: string) {
    return this.platform.listChurches(q);
  }

  @Post('churches')
  createChurch(@Req() req: PlatformRequest, @Body() dto: CreateChurchDto) {
    return this.platform.createChurch(this.actor(req), dto, req.ip);
  }

  @Get('churches/:id')
  church(@Param('id') id: string) {
    return this.platform.getChurch(id);
  }

  @Patch('churches/:id')
  updateChurch(@Req() req: PlatformRequest, @Param('id') id: string, @Body() dto: UpdateChurchDto) {
    return this.platform.updateChurch(this.actor(req), id, dto, req.ip);
  }

  @Get('users')
  users(@Query('churchId') churchId?: string) {
    return this.platform.listUsers(churchId);
  }

  @Post('users')
  createUser(@Req() req: PlatformRequest, @Body() dto: CreateUserDto) {
    return this.platform.createUser(this.actor(req), dto, req.ip);
  }

  @Patch('users/:id')
  updateUser(@Req() req: PlatformRequest, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.platform.updateUser(this.actor(req), id, dto, req.ip);
  }

  @Post('users/:id/password')
  @HttpCode(200)
  resetPassword(@Req() req: PlatformRequest, @Param('id') id: string, @Body() dto: PasswordDto) {
    return this.platform.resetPassword(this.actor(req), id, dto.password, req.ip);
  }

  @Post('users/:id/roles')
  @HttpCode(200)
  roles(@Req() req: PlatformRequest, @Param('id') id: string, @Body() dto: RolesDto) {
    return this.platform.setRoles(this.actor(req), id, dto.roleKeys, req.ip);
  }

  /** Opens a church as this user in a new tab (single-use 90s link). */
  @Post('users/:id/impersonate')
  @HttpCode(200)
  impersonate(@Req() req: PlatformRequest, @Param('id') id: string) {
    return this.platform.impersonate(this.actor(req), id, req.ip);
  }

  @Get('payments')
  payments(@Query('status') status?: string) {
    return this.platform.listPayments(status);
  }

  @Post('payments/:id/confirm')
  @HttpCode(200)
  confirmPayment(@Req() req: PlatformRequest, @Param('id') id: string) {
    return this.platform.confirmPayment(this.actor(req), id, req.ip);
  }

  @Post('payments/:id/cancel')
  @HttpCode(200)
  cancelPayment(@Req() req: PlatformRequest, @Param('id') id: string) {
    return this.platform.cancelPayment(this.actor(req), id, req.ip);
  }
}
