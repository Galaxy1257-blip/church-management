import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { hasPermission, Permission } from '@chms/shared';
import { PUBLIC_KEY, PERMISSIONS_KEY } from './decorators';
import type { Env } from '../env';

export interface AuthUser {
  userId: string;
  churchId: string;
  name: string;
  phoneE164: string;
  roles: string[];
  permissions: string[];
  branchIds: string[];
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
  rawBody?: Buffer;
}

interface AccessClaims {
  sub: string;
  cid: string;
  name: string;
  phone: string;
  roles: string[];
  perms: string[];
  bid: string[];
  aud: string;
}

/**
 * Verifies the bearer access token and attaches AuthUser.
 * @Public() routes skip verification entirely.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    @Inject('ENV') private readonly env: Env,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException('missing bearer token');

    try {
      const claims = await this.jwt.verifyAsync<AccessClaims>(token, {
        secret: this.env.JWT_SECRET,
        audience: 'access',
      });
      req.user = {
        userId: claims.sub,
        churchId: claims.cid,
        name: claims.name,
        phoneE164: claims.phone,
        roles: claims.roles ?? [],
        permissions: claims.perms ?? [],
        branchIds: claims.bid ?? [],
      };
      return true;
    } catch {
      throw new UnauthorizedException('invalid or expired access token');
    }
  }
}

/**
 * Default-deny RBAC: a handler with no @RequirePermissions metadata is a
 * boot-time configuration error, not an implicit allow.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      throw new InternalServerErrorException(
        'route is missing @RequirePermissions (default-deny): add the decorator or @Public()',
      );
    }

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const user = req.user;
    if (!user) throw new UnauthorizedException('no user on request');

    for (const perm of required) {
      if (!hasPermission(user.permissions, perm)) return false;
    }
    return true;
  }
}
