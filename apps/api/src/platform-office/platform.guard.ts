// Platform Office auth. Staff tokens carry audience "platform" and never pass
// the church JwtAuthGuard; church tokens never pass this guard either. Platform
// routes are marked @Public so the tenant guards skip them entirely.
//
// The token only proves WHO signed in; the role and active flag are read from
// the database on every request so disabling an onboarder or changing a role
// takes effect immediately instead of at the end of their 12-hour token.
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { platformPrisma } from '@chms/db';
import type { Request } from 'express';
import type { Env } from '../env';

export type PlatformRole = 'OWNER' | 'ONBOARDER' | 'SUPPORT';

export interface PlatformActor {
  id: string;
  name: string;
  email: string;
  role: PlatformRole;
}

export interface PlatformRequest extends Request {
  platformUser?: PlatformActor;
}

interface PlatformClaims {
  sub: string;
  aud: string;
}

@Injectable()
export class PlatformGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    @Inject('ENV') private readonly env: Env,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<PlatformRequest>();
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException('missing platform token');

    let claims: PlatformClaims;
    try {
      claims = await this.jwt.verifyAsync<PlatformClaims>(token, {
        secret: this.env.JWT_SECRET,
        audience: 'platform',
      });
    } catch {
      throw new UnauthorizedException('invalid or expired platform token');
    }

    const staff = await platformPrisma.platformUser.findUnique({
      where: { id: claims.sub },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });
    if (!staff || !staff.isActive) throw new UnauthorizedException('staff account is disabled');
    req.platformUser = {
      id: staff.id,
      name: staff.name,
      email: staff.email,
      role: staff.role,
    };
    return true;
  }
}
