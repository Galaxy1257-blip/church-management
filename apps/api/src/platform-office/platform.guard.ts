// Platform Office auth. Staff tokens carry audience "platform" and never pass
// the church JwtAuthGuard; church tokens never pass this guard either. Platform
// routes are marked @Public so the tenant guards skip them entirely.
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { Env } from '../env';

export interface PlatformActor {
  id: string;
  name: string;
  email: string;
  role: 'OWNER' | 'SUPPORT';
}

export interface PlatformRequest extends Request {
  platformUser?: PlatformActor;
}

interface PlatformClaims {
  sub: string;
  name: string;
  email: string;
  role: 'OWNER' | 'SUPPORT';
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

    try {
      const claims = await this.jwt.verifyAsync<PlatformClaims>(token, {
        secret: this.env.JWT_SECRET,
        audience: 'platform',
      });
      req.platformUser = {
        id: claims.sub,
        name: claims.name,
        email: claims.email,
        role: claims.role,
      };
      return true;
    } catch {
      throw new UnauthorizedException('invalid or expired platform token');
    }
  }
}
