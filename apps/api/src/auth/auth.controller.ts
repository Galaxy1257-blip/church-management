import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { Authenticated, Public } from '../common/decorators';
import { AuthedRequest } from '../common/guards';
import { RateLimit, RateLimitGuard } from '../common/rate-limit';
import { AuthService } from './auth.service';

class LoginDto {
  @IsString() churchSlug!: string;
  @IsString() phoneE164!: string;
  @IsString() @MinLength(6) password!: string;
}

class SignupDto {
  @IsString() churchSlug!: string;
  @IsString() @MinLength(2) name!: string;
  @IsString() phoneE164!: string;
  @IsString() @MinLength(6) password!: string;
}

class OtpRequestDto {
  @IsString() churchSlug!: string;
  @IsString() phoneE164!: string;
}

class OtpVerifyDto {
  @IsString() churchSlug!: string;
  @IsString() phoneE164!: string;
  @IsString() @MinLength(4) code!: string;
}

class RefreshDto {
  @IsString() refreshToken!: string;
}

class HandoffDto {
  @IsString() token!: string;
}

// Every unauthenticated route carries a bucket: without one, /auth/login is an
// offline bcrypt-cracking oracle and /auth/otp/request is a way to spend the
// church's SMS credits from a loop.
@Controller('auth')
@UseGuards(RateLimitGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @RateLimit([
    { key: 'login:ip', limit: 30, windowMs: 5 * 60_000 },
    { key: 'login:phone', limit: 8, windowMs: 5 * 60_000, byPhone: true },
  ])
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.loginWithPassword(dto);
  }

  @Public()
  @RateLimit({ key: 'signup:ip', limit: 5, windowMs: 60 * 60_000 })
  @Post('signup')
  @HttpCode(200)
  signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto);
  }

  @Public()
  @RateLimit([
    { key: 'otp:request:phone', limit: 3, windowMs: 60 * 60_000, byPhone: true },
    { key: 'otp:request:ip', limit: 10, windowMs: 60 * 60_000 },
  ])
  @Post('otp/request')
  @HttpCode(202)
  async requestOtp(@Body() dto: OtpRequestDto) {
    await this.auth.requestOtp(dto);
    return { accepted: true }; // always 202: no user enumeration
  }

  @Public()
  @RateLimit({
    key: 'otp:verify',
    limit: 10,
    windowMs: 10 * 60_000,
    byPhone: true,
  })
  @Post('otp/verify')
  @HttpCode(200)
  verifyOtp(@Body() dto: OtpVerifyDto) {
    return this.auth.verifyOtp(dto);
  }

  @Public()
  @RateLimit({ key: 'refresh:ip', limit: 60, windowMs: 5 * 60_000 })
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  /**
   * Platform office "open as this church user": a 90-second single-use link,
   * exchanged here for a short access token (no refresh token).
   */
  @Public()
  @RateLimit({ key: 'handoff:ip', limit: 20, windowMs: 5 * 60_000 })
  @Post('handoff')
  @HttpCode(200)
  handoff(@Body() dto: HandoffDto) {
    return this.auth.exchangeHandoff(dto.token);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Body() dto: RefreshDto) {
    await this.auth.logout(dto.refreshToken);
  }

  /**
   * Identity of the signed-in user. @Authenticated (not @RequirePermissions):
   * a MEMBER holds zero staff permissions but still needs to read who they are
   * so the web shell can route them to the member portal instead of the modules.
   */
  @Authenticated()
  @Get('me')
  me(@Req() req: AuthedRequest) {
    return this.auth.me(req.user!.userId, req.user!.churchId);
  }
}
