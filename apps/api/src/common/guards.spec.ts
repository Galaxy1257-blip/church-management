import { describe, expect, it } from 'vitest';
import { ExecutionContext, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { hasPermission } from '@chms/shared';
import { JwtAuthGuard, PermissionsGuard, AuthUser } from './guards';
import { PERMISSIONS_KEY, PUBLIC_KEY } from './decorators';

function makeContext(handlerMeta: Record<string | symbol, unknown> = {}): ExecutionContext {
  const handler = () => undefined;
  for (const [k, v] of Object.entries(handlerMeta)) {
    Reflect.defineMetadata(k, v, handler);
  }
  const request = { headers: { authorization: 'Bearer x' } as Record<string, string> };
  return {
    getHandler: () => handler,
    getClass: () => class TestController {},
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

function attachUser(ctx: ExecutionContext, user: AuthUser): void {
  (ctx.switchToHttp().getRequest() as { user: AuthUser }).user = user;
}

describe('PermissionsGuard (default-deny)', () => {
  const guard = new PermissionsGuard(new Reflector());

  it('rejects routes with NO permission metadata (fail fast, not implicit allow)', () => {
    expect(() => guard.canActivate(makeContext({}))).toThrow(InternalServerErrorException);
  });

  it('rejects routes with EMPTY permission metadata', () => {
    expect(() => guard.canActivate(makeContext({ [PERMISSIONS_KEY]: [] }))).toThrow(InternalServerErrorException);
  });

  it('skips @Public routes entirely', () => {
    expect(guard.canActivate(makeContext({ [PUBLIC_KEY]: true }))).toBe(true);
  });

  it('allows when the user grants every required permission', () => {
    const ctx = makeContext({ [PERMISSIONS_KEY]: ['headcount:write'] });
    attachUser(ctx, {
      userId: 'u1',
      churchId: 'c1',
      name: 'Usher',
      phoneE164: '+233240000000',
      roles: ['USHER'],
      permissions: ['headcount:write', 'services:read'],
      branchIds: [],
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('denies when a required permission is missing', () => {
    const ctx = makeContext({ [PERMISSIONS_KEY]: ['finance:approve'] });
    attachUser(ctx, {
      userId: 'u1',
      churchId: 'c1',
      name: 'Usher',
      phoneE164: '+233240000000',
      roles: ['USHER'],
      permissions: ['headcount:write'],
      branchIds: [],
    });
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('requires ALL listed permissions', () => {
    const ctx = makeContext({ [PERMISSIONS_KEY]: ['finance:approve', 'finance:read'] });
    attachUser(ctx, {
      userId: 'u1',
      churchId: 'c1',
      name: 'partial',
      phoneE164: '+233240000000',
      roles: ['FINANCE_ADMIN'],
      permissions: ['finance:read'], // missing approve
      branchIds: [],
    });
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('wildcard * grants everything', () => {
    const ctx = makeContext({ [PERMISSIONS_KEY]: ['audit:read'] });
    attachUser(ctx, {
      userId: 'u1',
      churchId: 'c1',
      name: 'Admin',
      phoneE164: '+233240000000',
      roles: ['SUPER_ADMIN'],
      permissions: ['*'],
      branchIds: [],
    });
    expect(guard.canActivate(ctx)).toBe(true);
    expect(hasPermission(['*'], 'anything:here')).toBe(true);
  });
});

describe('JwtAuthGuard', () => {
  const jwt = new JwtService({});
  const env = { JWT_SECRET: 'test-secret-32-characters-min!!' } as any;

  it('lets @Public routes through without a token', async () => {
    const guard = new JwtAuthGuard(jwt, new Reflector(), env);
    const ctx = makeContext({ [PUBLIC_KEY]: true });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('rejects missing bearer tokens on protected routes', async () => {
    const guard = new JwtAuthGuard(jwt, new Reflector(), env);
    const ctx = makeContext({ [PERMISSIONS_KEY]: ['members:read'] });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('accepts a valid access token and attaches the user', async () => {
    const guard = new JwtAuthGuard(jwt, new Reflector(), env);
    const token = await jwt.signAsync(
      {
        sub: 'u1',
        cid: 'c1',
        name: 'Admin',
        phone: '+233240000000',
        roles: ['SUPER_ADMIN'],
        perms: ['*'],
        bid: [],
        aud: 'access',
      },
      { secret: env.JWT_SECRET, expiresIn: 60 },
    );
    const ctx = makeContext({ [PERMISSIONS_KEY]: ['members:read'] });
    const req = ctx.switchToHttp().getRequest() as { headers: Record<string, string>; user?: AuthUser };
    req.headers.authorization = `Bearer ${token}`;
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.user?.userId).toBe('u1');
    expect(req.user?.churchId).toBe('c1');
  });

  it('rejects refresh-audience tokens used as access tokens', async () => {
    const guard = new JwtAuthGuard(jwt, new Reflector(), env);
    const refresh = await jwt.signAsync(
      { sub: 'u1', cid: 'c1', jti: 'j1', aud: 'refresh' },
      { secret: env.JWT_SECRET, expiresIn: 60 },
    );
    const ctx = makeContext({ [PERMISSIONS_KEY]: ['members:read'] });
    const req = ctx.switchToHttp().getRequest() as { headers: Record<string, string> };
    req.headers.authorization = `Bearer ${refresh}`;
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });
});
