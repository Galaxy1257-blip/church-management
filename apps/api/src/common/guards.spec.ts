import { describe, expect, it } from 'vitest';
import { ExecutionContext, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { hasPermission } from '@chms/shared';
import { JwtAuthGuard, PermissionsGuard, AuthUser } from './guards';
import { AUTHENTICATED_KEY, PERMISSIONS_KEY, PUBLIC_KEY } from './decorators';

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

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    userId: 'u1',
    churchId: 'c1',
    name: 'Usher',
    phoneE164: '+233240000000',
    roles: ['USHER'],
    permissions: ['headcount:write'],
    branchIds: [],
    scope: 'ALL',
    ...overrides,
  };
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
    attachUser(ctx, makeUser({ permissions: ['headcount:write', 'services:read'] }));
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('denies when a required permission is missing', () => {
    const ctx = makeContext({ [PERMISSIONS_KEY]: ['finance:approve'] });
    attachUser(ctx, makeUser());
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('requires ALL listed permissions', () => {
    const ctx = makeContext({ [PERMISSIONS_KEY]: ['finance:approve', 'finance:read'] });
    attachUser(ctx, makeUser({ name: 'partial', roles: ['FINANCE_ADMIN'], permissions: ['finance:read'] })); // missing approve
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('wildcard * grants everything', () => {
    const ctx = makeContext({ [PERMISSIONS_KEY]: ['audit:read'] });
    attachUser(ctx, makeUser({ name: 'Admin', roles: ['SUPER_ADMIN'], permissions: ['*'] }));
    expect(guard.canActivate(ctx)).toBe(true);
    expect(hasPermission(['*'], 'anything:here')).toBe(true);
  });

  it('@Authenticated allows a member with zero permissions', () => {
    const ctx = makeContext({ [AUTHENTICATED_KEY]: true });
    attachUser(ctx, makeUser({ roles: ['MEMBER'], permissions: [], scope: 'SELF' }));
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('@Authenticated still refuses an anonymous request', () => {
    const ctx = makeContext({ [AUTHENTICATED_KEY]: true });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('@Authenticated never overrides an explicit permission list', () => {
    const ctx = makeContext({ [AUTHENTICATED_KEY]: true, [PERMISSIONS_KEY]: ['finance:approve'] });
    attachUser(ctx, makeUser({ roles: ['MEMBER'], permissions: [], scope: 'SELF' }));
    // The permission list wins whenever it is present on the handler.
    expect(guard.canActivate(ctx)).toBe(false);
  });
});

describe('JwtAuthGuard', () => {
  const jwt = new JwtService({});
  const env = { JWT_SECRET: 'test-secret-32-characters-min!!' } as any;

  async function signAccess(extra: Record<string, unknown> = {}): Promise<string> {
    return jwt.signAsync(
      {
        sub: 'u1',
        cid: 'c1',
        name: 'Admin',
        phone: '+233240000000',
        roles: ['SUPER_ADMIN'],
        perms: ['*'],
        bid: [],
        aud: 'access',
        ...extra,
      },
      { secret: env.JWT_SECRET, expiresIn: 60 },
    );
  }

  function authedRequest(token: string) {
    const ctx = makeContext({ [PERMISSIONS_KEY]: ['members:read'] });
    const req = ctx.switchToHttp().getRequest() as { headers: Record<string, string>; user?: AuthUser };
    req.headers.authorization = `Bearer ${token}`;
    return { ctx, req };
  }

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
    const { ctx, req } = authedRequest(await signAccess({ scp: 'ALL' }));
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.user?.userId).toBe('u1');
    expect(req.user?.churchId).toBe('c1');
    expect(req.user?.scope).toBe('ALL');
  });

  it('derives scope for legacy tokens that predate the scp claim', async () => {
    const guard = new JwtAuthGuard(jwt, new Reflector(), env);
    const { ctx, req } = authedRequest(
      await signAccess({ roles: ['LEADER'], perms: ['members:read'], bid: ['b1'] }),
    );
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.user?.scope).toBe('BRANCH');
  });

  it('gives a pastor church-wide scope', async () => {
    const guard = new JwtAuthGuard(jwt, new Reflector(), env);
    const { ctx, req } = authedRequest(await signAccess({ roles: ['PASTOR'], perms: ['finance:read'] }));
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.user?.scope).toBe('ALL');
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
