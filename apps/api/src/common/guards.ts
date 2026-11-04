import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import {
  hasPermission,
  MODULE_LABELS,
  Permission,
  resolveDataScope,
  type DataScope,
  type ModuleKey,
  type RoleKey,
} from '@chms/shared';
import { ANY_PERMISSIONS_KEY, AUTHENTICATED_KEY, INTAKE_KEY, PUBLIC_KEY, PERMISSIONS_KEY, MODULE_KEY } from './decorators';
import { ModuleFlagsService } from './module-flags';
import type { Env } from '../env';

export interface AuthUser {
  userId: string;
  churchId: string;
  name: string;
  phoneE164: string;
  roles: string[];
  permissions: string[];
  branchIds: string[];
  /** ALL (whole church) | BRANCH (assigned branches) | SELF | NONE. */
  scope: DataScope;
  /** Sunday School teachers only see the class the office assigned. */
  careClassBracketId?: string | null;
  /** ALL | MALE | FEMALE within that class. */
  careClassSegment?: string | null;
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
  /** Added with role tiers; older tokens omit it and are derived from roles. */
  scp?: DataScope;
  /** Care class (Sunday School teacher); older tokens omit it. */
  ccb?: string | null;
  ccs?: string | null;
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
      const roles = claims.roles ?? [];
      const branchIds = claims.bid ?? [];
      req.user = {
        userId: claims.sub,
        churchId: claims.cid,
        name: claims.name,
        phoneE164: claims.phone,
        roles,
        permissions: claims.perms ?? [],
        branchIds,
        // Tokens minted before role tiers existed have no `scp`; derive it so a
        // deployment never mislabels a pastor as branch-scoped.
        scope: claims.scp ?? resolveDataScope(roles as RoleKey[], branchIds),
        careClassBracketId: claims.ccb ?? null,
        careClassSegment: claims.ccs ?? null,
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
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, targets);
    const anyOf = this.reflector.getAllAndOverride<Permission[] | undefined>(ANY_PERMISSIONS_KEY, targets);
    const isAuthenticatedOnly = this.reflector.getAllAndOverride<boolean>(AUTHENTICATED_KEY, targets) === true;

    const hasRequired = !!required && required.length > 0;
    const hasAnyOf = !!anyOf && anyOf.length > 0;

    // Default-deny: a handler must declare @RequirePermissions, @AnyPermission,
    // @Authenticated() or @Public().
    if (!isAuthenticatedOnly && !hasRequired && !hasAnyOf) {
      throw new InternalServerErrorException(
        'route is missing @RequirePermissions (default-deny): add the decorator, @Authenticated() or @Public()',
      );
    }

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const user = req.user;
    if (!user) throw new UnauthorizedException('no user on request');

    // Explicit permissions always win over @Authenticated(), so accidentally
    // stacking both decorators can never widen access.
    if (hasRequired) {
      for (const perm of required as Permission[]) {
        if (!hasPermission(user.permissions, perm)) return false;
      }
    }
    if (hasAnyOf) {
      if (!(anyOf as Permission[]).some((perm) => hasPermission(user.permissions, perm))) return false;
    }
    if (hasRequired || hasAnyOf) return true;

    // @Authenticated(): any valid session, including a MEMBER with zero permissions.
    return true;
  }
}

/**
 * App-section switches, enforced server-side. A route names the section it
 * belongs to with @ForModule(); when that section is switched off for the
 * church, the data is not available — not even to a role holding every
 * permission for it. A @Public() door is different: the congregation is not the
 * office. The give link closes with the books only if that is what the church
 * answered in Settings, which is what @PublicIntake reads.
 */
@Injectable()
export class ModuleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly flags: ModuleFlagsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets);
    const intake = this.reflector.getAllAndOverride<ModuleKey | undefined>(INTAKE_KEY, targets);

    if (intake) {
      const req = context.switchToHttp().getRequest<AuthedRequest>();
      const slug = String((req.body as { churchSlug?: unknown } | undefined)?.churchSlug ?? '');
      if (!slug) throw new BadRequestException('this giving request names no church');
      if (await this.flags.givingDoorClosedForSlug(slug)) {
        throw new ForbiddenException(`${MODULE_LABELS[intake].label} is switched off for this church, and the church has stopped online giving too.`);
      }
      return true;
    }

    if (isPublic) return true;

    const key = this.reflector.getAllAndOverride<ModuleKey | undefined>(MODULE_KEY, targets);
    if (!key) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const user = req.user;
    // JwtAuthGuard runs first, so a session is always present by here.
    if (!user) return true;

    if ((await this.flags.flagsFor(user.churchId))[key]) return true;
    throw new ForbiddenException(
      `${MODULE_LABELS[key].label} is switched off for this church. Turn it on in Settings → App sections.`,
    );
  }
}
