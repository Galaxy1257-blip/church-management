import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { Authenticated, Public } from '../common/decorators';
import { AuthedRequest } from '../common/guards';
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

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.loginWithPassword(dto);
  }

  @Public()
  @Post('signup')
  @HttpCode(200)
  signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto);
  }

  @Public()
  @Post('otp/request')
  @HttpCode(202)
  async requestOtp(@Body() dto: OtpRequestDto) {
    await this.auth.requestOtp(dto);
    return { accepted: true }; // always 202: no user enumeration
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(200)
  verifyOtp(@Body() dto: OtpVerifyDto) {
    return this.auth.verifyOtp(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
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
