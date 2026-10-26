// Auth: phone OTP + password login, JWT access tokens, one-time-use refresh
// rotation (Phase 0). OTP codes are hashed (sha256 + server secret), attempt-
// capped, and sent through the single SMS dispatcher (OTP = opt-out exempt).
import { BadRequestException, ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { createHash, randomInt } from 'node:crypto';
// Cross-tenant lookups by phone (login, OTP, session load) run BEFORE any
// church context exists â€” under the app_user client FORCE RLS hides every row
// (login always failed with "invalid credentials"). Auth is a platform-scope
// concern, like webhooks: use platformPrisma (BYPASSRLS); tenant writes stay
// in withTenant.
import { platformPrisma as prisma, withPlatform, withTenant } from '@chms/db';
import { normalizeGhPhone, permissionsForRoles, resolveDataScope, resolveModules, RoleKey, localizedSmsBody } from '@chms/shared';
import type { Env } from '../env';
import { AuthUser } from '../common/guards';
import { timingSafeEqualStr } from '../common/crypto';
import { allocateMemberNo } from '../common/member-no';
import { SmsDispatcher } from '../sms/sms-dispatcher';

const OTP_TTL_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
}

interface AccessClaims {
  sub: string;
  cid: string;
  name: string;
  phone: string;
  roles: string[];
  perms: string[];
  bid: string[];
  scp: string;
  aud: 'access';
}

interface RefreshClaims {
  sub: string;
  cid: string;
  jti: string;
  aud: 'refresh';
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function hashCode(code: string, secret: string): string {
  return createHash('sha256').update(`${code}:${secret}`).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    @Inject('ENV') private readonly env: Env,
    private readonly sms: SmsDispatcher,
  ) {}

  private async loadUser(churchId: string, userId: string): Promise<AuthUser> {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { roles: { include: { role: true } }, branches: true },
    });
    const roles = user.roles.map((r) => r.role.key as RoleKey);
    const branchIds = user.branches.map((b) => b.branchId);
    return {
      userId: user.id,
      churchId: user.churchId,
      name: user.name,
      phoneE164: user.phoneE164,
      roles,
      permissions: permissionsForRoles(roles),
      branchIds,
      scope: resolveDataScope(roles, branchIds),
    };
  }

  private async issueTokens(user: AuthUser): Promise<TokenPair> {
    const accessClaims: AccessClaims = {
      sub: user.userId,
      cid: user.churchId,
      name: user.name,
      phone: user.phoneE164,
      roles: user.roles,
      perms: user.permissions,
      bid: user.branchIds,
      scp: user.scope,
      aud: 'access',
    };
    const accessToken = await this.jwt.signAsync(accessClaims, {
      secret: this.env.JWT_SECRET,
      expiresIn: this.env.ACCESS_TOKEN_TTL_SEC,
    });

    const jti = createHash('sha256').update(`${user.userId}:${Date.now()}:${Math.random()}`).digest('hex');
    const refreshToken = await this.jwt.signAsync(
      { sub: user.userId, cid: user.churchId, jti, aud: 'refresh' } satisfies RefreshClaims,
      { secret: this.env.JWT_SECRET, expiresIn: this.env.REFRESH_TOKEN_TTL_SEC },
    );

    await withTenant(user.churchId, user.userId, (tx) =>
      tx.refreshToken.create({
        data: {
          churchId: user.churchId,
          userId: user.userId,
          tokenHash: hashToken(refreshToken),
          expiresAt: new Date(Date.now() + this.env.REFRESH_TOKEN_TTL_SEC * 1000),
        },
      }),
    );

    return { accessToken, refreshToken, expiresInSec: this.env.ACCESS_TOKEN_TTL_SEC };
  }

  private async touchLogin(churchId: string, userId: string): Promise<void> {
    await withTenant(churchId, userId, (tx) =>
      tx.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } }),
    );
  }

  async loginWithPassword(input: {
    churchSlug: string;
    phoneE164: string;
    password: string;
  }): Promise<TokenPair> {
    const phone = normalizeGhPhone(input.phoneE164);
    const church = await prisma.church.findUnique({ where: { slug: input.churchSlug.trim().toLowerCase() } });
    if (!church) throw new UnauthorizedException('invalid credentials');
    const user = await prisma.user.findUnique({
      where: { churchId_phoneE164: { churchId: church.id, phoneE164: phone } },
    });
    if (!user || !user.isActive || !user.passwordHash) throw new UnauthorizedException('invalid credentials');
    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('invalid credentials');

    const authUser = await this.loadUser(user.churchId, user.id);
    await this.touchLogin(user.churchId, user.id);
    return this.issueTokens(authUser);
  }

  /**
   * Self-registration ("Create account"): join an EXISTING church by its slug.
   * Creates a User with the MEMBER role (zero staff permissions) plus a linked
   * Member record so the person shows up in the church's data immediately.
   */
  async signup(input: { churchSlug: string; name: string; phoneE164: string; password: string }): Promise<TokenPair> {
    let phone: string;
    try {
      phone = normalizeGhPhone(input.phoneE164);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'bad phone number');
    }
    const name = input.name.trim().replace(/\s+/g, ' ');
    if (name.length < 2) throw new BadRequestException('name is required');
    const slug = input.churchSlug.trim().toLowerCase(); // ids are case-insensitive-unique
    const church = await prisma.church.findUnique({ where: { slug } });
    if (!church) throw new BadRequestException(`no church with id "${slug}"`);

    const existing = await prisma.user.findUnique({
      where: { churchId_phoneE164: { churchId: church.id, phoneE164: phone } },
    });
    if (existing) throw new ConflictException('an account already exists for this phone â€” sign in instead');

    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await withPlatform(async (tx) => {
      let role = await tx.role.findUnique({ where: { churchId_key: { churchId: church.id, key: 'MEMBER' } } });
      if (!role) {
        role = await tx.role.create({ data: { churchId: church.id, key: 'MEMBER', name: 'Member', permissions: [] } });
      }
      const u = await tx.user.create({
        data: { churchId: church.id, name, phoneE164: phone, passwordHash },
      });
      await tx.userRole.create({ data: { userId: u.id, roleId: role.id } });

      // Member record (same memberNo scheme as members.service). The number is
      // allocated under the per-church advisory lock, so a signup racing a staff
      // create cannot produce a duplicate key in front of the user.
      const parts = name.split(' ');
      const member = await tx.member.create({
        data: {
          churchId: church.id,
          memberNo: await allocateMemberNo(tx, church.id),
          firstName: parts[0],
          lastName: parts.slice(1).join(' ') || parts[0],
          phoneE164: phone,
          status: 'ACTIVE',
        },
      });
      await tx.user.update({ where: { id: u.id }, data: { memberId: member.id } });
      return u;
    });

    const authUser = await this.loadUser(church.id, user.id);
    await this.touchLogin(church.id, user.id);
    return this.issueTokens(authUser);
  }

  /** Always resolves (no user enumeration); sends only when the account exists. */
  async requestOtp(input: { churchSlug: string; phoneE164: string }): Promise<void> {
    const phone = normalizeGhPhone(input.phoneE164);
    const church = await prisma.church.findUnique({ where: { slug: input.churchSlug.trim().toLowerCase() } });
    if (!church) return;
    const user = await prisma.user.findUnique({
      where: { churchId_phoneE164: { churchId: church.id, phoneE164: phone } },
    });
    if (!user || !user.isActive) return;

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const logId = await withTenant(church.id, user.id, async (tx) => {
      await tx.otpChallenge.create({
        data: {
          churchId: church.id,
          phoneE164: phone,
          codeHash: hashCode(code, this.env.JWT_SECRET),
          expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000),
        },
      });
      const outcome = await this.sms.dispatch(tx, {
        churchId: church.id,
        toE164: phone,
        body: localizedSmsBody('otp', ((church.settings ?? {}) as any).smsLocales, {
          code,
          ttlMinutes: OTP_TTL_MINUTES,
        }),
        source: 'OTP',
        idempotencyKey: `otp:${user.id}:${Date.now()}`,
      });
      return outcome.status === 'QUEUED' ? outcome.logId : null;
    });
    if (logId) this.sms.flush({ status: 'QUEUED', logId, segments: 0 });
  }

  async verifyOtp(input: { churchSlug: string; phoneE164: string; code: string }): Promise<TokenPair> {
    const phone = normalizeGhPhone(input.phoneE164);
    const church = await prisma.church.findUnique({ where: { slug: input.churchSlug.trim().toLowerCase() } });
    if (!church) throw new UnauthorizedException('invalid or expired code');

    const codeHash = hashCode(input.code, this.env.JWT_SECRET);
    const result = await withTenant(church.id, null, async (tx) => {
      // Look up the newest live challenge for this PHONE, not for this code hash.
      // The old filter was `codeHash`, so a wrong code matched no row, `attempts`
      // was never incremented and OTP_MAX_ATTEMPTS was unreachable — 6 digits were
      // brute-forceable until the 5-minute expiry.
      const open = await tx.otpChallenge.findMany({
        where: {
          churchId: church.id,
          phoneE164: phone,
          consumedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { id: 'desc' }, // uuidv7 ids are time-ordered
        take: 1,
      });
      const latest = open[0];
      if (!latest) return { ok: false as const };

      if (latest.attempts >= OTP_MAX_ATTEMPTS) {
        // Burn it: the caller must request a fresh code.
        await tx.otpChallenge.update({ where: { id: latest.id }, data: { consumedAt: new Date() } });
        return { ok: false as const };
      }

      if (!timingSafeEqualStr(latest.codeHash, codeHash)) {
        await tx.otpChallenge.update({
          where: { id: latest.id },
          data: { attempts: { increment: 1 } },
        });
        return { ok: false as const };
      }

      await tx.otpChallenge.update({
        where: { id: latest.id },
        data: { attempts: { increment: 1 }, consumedAt: new Date() },
      });
      return { ok: true as const, churchId: latest.churchId, phoneE164: latest.phoneE164 };
    });

    if (!result.ok) throw new UnauthorizedException('invalid or expired code');

    const user = await prisma.user.findUnique({
      where: { churchId_phoneE164: { churchId: result.churchId, phoneE164: result.phoneE164 } },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('invalid or expired code');

    const authUser = await this.loadUser(user.churchId, user.id);
    await this.touchLogin(user.churchId, user.id);
    return this.issueTokens(authUser);
  }

  /** One-time-use rotation: reusing a revoked token revokes the whole family. */
  async refresh(refreshToken: string): Promise<TokenPair> {
    let claims: RefreshClaims;
    try {
      claims = await this.jwt.verifyAsync<RefreshClaims>(refreshToken, {
        secret: this.env.JWT_SECRET,
        audience: 'refresh',
      });
    } catch {
      throw new UnauthorizedException('invalid refresh token');
    }

    const tokenHash = hashToken(refreshToken);
    const outcome = await withTenant(claims.cid, claims.sub, async (tx) => {
      const row = await tx.refreshToken.findUnique({ where: { tokenHash } });
      if (!row || row.userId !== claims.sub) return { kind: 'invalid' as const };
      if (row.revokedAt) {
        await tx.refreshToken.updateMany({
          where: { userId: claims.sub, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return { kind: 'reused' as const };
      }
      if (row.expiresAt < new Date()) return { kind: 'invalid' as const };

      const user = await this.loadUser(claims.cid, claims.sub);
      const tokens = await this.issueTokens(user);
      await tx.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
      return { kind: 'rotated' as const, tokens };
    });

    if (outcome.kind === 'reused') throw new UnauthorizedException('refresh token reuse detected');
    if (outcome.kind === 'invalid') throw new UnauthorizedException('invalid refresh token');
    return outcome.tokens;
  }

  async logout(refreshToken: string): Promise<void> {
    let claims: RefreshClaims;
    try {
      claims = await this.jwt.verifyAsync<RefreshClaims>(refreshToken, {
        secret: this.env.JWT_SECRET,
        audience: 'refresh',
      });
    } catch {
      return; // idempotent
    }
    await withTenant(claims.cid, claims.sub, (tx) =>
      tx.refreshToken.updateMany({
        where: { userId: claims.sub, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    );
  }

  async me(
    userId: string,
    churchId: string,
  ): Promise<
    AuthUser & {
      church: { name: string; slug: string; branding: unknown };
      modules: Record<string, boolean>;
    }
  > {
    const user = await this.loadUser(churchId, userId);
    const church = await prisma.church.findUniqueOrThrow({
      where: { id: churchId },
      select: { name: true, slug: true, settings: true },
    });
    const settings = (church.settings ?? {}) as Record<string, unknown>;
    const branding = settings.branding ?? null;
    // Which areas of the app this church has switched on (settings.modules).
    // Sent with the session so the shell can hide whole areas without a round trip.
    return { ...user, church: { name: church.name, slug: church.slug, branding }, modules: resolveModules(settings) };
  }
}

