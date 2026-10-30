// Platform Office: the OmniLabs support backend. Staff sign in separately from
// church users, see every church, act on one church's behalf (users, modules,
// billing, impersonation) and read its audit trail.
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { appendAudit, platformPrisma as prisma, withPlatform } from '@chms/db';
import {
  MODULE_DEFAULTS,
  normalizeGhPhone,
  permissionsForRoles,
  resolveModules,
  uuidv7,
  type ModuleKey,
  type RoleKey,
} from '@chms/shared';
import { BillingService } from '../billing/billing.service';
import { deriveBilling } from '../billing/billing.logic';
import { ChurchesService } from '../churches/churches.service';
import type { Env } from '../env';
import type { PlatformActor } from './platform.guard';

const CHURCH_SELECT = {
  id: true,
  name: true,
  slug: true,
  plan: true,
  createdAt: true,
  pastorDisplayName: true,
  settings: true,
  monthlyFeeMinor: true,
  billingDay: true,
  graceDays: true,
  trialEndsAt: true,
  paidUntil: true,
  billingPausedAt: true,
  billingExempt: true,
  billingLocked: true,
  billingEmail: true,
  billingPhone: true,
  billingNote: true,
} as const;

@Injectable()
export class PlatformService {
  constructor(
    @Inject('ENV') private readonly env: Env,
    private readonly jwt: JwtService,
    private readonly churches: ChurchesService,
    private readonly billing: BillingService,
  ) {}

  // ------------------------------------------------------------------ auth
  async login(email: string, password: string) {
    const staff = await prisma.platformUser.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    // Same message and timing-ish path for unknown email and bad password.
    if (!staff || !staff.isActive || !(await bcrypt.compare(password, staff.passwordHash))) {
      throw new UnauthorizedException('wrong email or password');
    }
    await prisma.platformUser.update({ where: { id: staff.id }, data: { lastLoginAt: new Date() } });
    const accessToken = await this.jwt.signAsync(
      { sub: staff.id, name: staff.name, email: staff.email, role: staff.role, aud: 'platform' },
      { secret: this.env.JWT_SECRET, expiresIn: '12h' },
    );
    return {
      accessToken,
      expiresInSec: 12 * 3600,
      user: { id: staff.id, name: staff.name, email: staff.email, role: staff.role },
    };
  }

  async me(actor: PlatformActor) {
    const staff = await prisma.platformUser.findUnique({
      where: { id: actor.id },
      select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true },
    });
    if (!staff || !staff.isActive) throw new UnauthorizedException('account is disabled');
    return staff;
  }

  private ownerOnly(actor: PlatformActor): void {
    if (actor.role !== 'OWNER') throw new ForbiddenException('only an owner can do this');
  }

  private async audit(
    churchId: string,
    actor: PlatformActor,
    action: string,
    entity: string,
    entityId: string | null,
    after?: unknown,
    before?: unknown,
    ip?: string,
  ): Promise<void> {
    await withPlatform((tx) =>
      appendAudit(tx, {
        churchId,
        actorId: actor.id,
        action,
        entity,
        entityId: entityId ?? undefined,
        after: after as never,
        before: before as never,
        ip,
      }),
    );
  }

  // --------------------------------------------------------------- overview
  async overview() {
    const now = new Date();
    const churches = await prisma.church.findMany({ select: CHURCH_SELECT });
    const counts: Record<string, number> = {};
    let mrrMinor = 0;
    let trialsEndingSoon = 0;
    for (const church of churches) {
      const snap = deriveBilling(church, now);
      counts[snap.state] = (counts[snap.state] ?? 0) + 1;
      if (snap.state === 'active' && !church.billingExempt) mrrMinor += church.monthlyFeeMinor;
      if (snap.state === 'trial' && snap.daysLeft <= 7) trialsEndingSoon += 1;
    }
    const awaitingConfirmation = await prisma.subscriptionPayment.count({ where: { status: 'PENDING' } });
    const recent = [...churches]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 5)
      .map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        createdAt: c.createdAt,
        state: deriveBilling(c, now).state,
      }));
    return {
      churches: churches.length,
      states: counts,
      mrrMinor,
      trialsEndingSoon,
      awaitingConfirmation,
      recent,
    };
  }

  // --------------------------------------------------------------- churches
  async listChurches(query?: string) {
    const now = new Date();
    const q = query?.trim();
    const churches = await prisma.church.findMany({
      where: q
        ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { slug: { contains: q, mode: 'insensitive' } }] }
        : undefined,
      orderBy: { createdAt: 'desc' },
      select: CHURCH_SELECT,
    });
    const ids = churches.map((c) => c.id);
    const [userCounts, memberCounts] = await Promise.all([
      prisma.user.groupBy({ by: ['churchId'], where: { churchId: { in: ids } }, _count: { _all: true } }),
      prisma.member.groupBy({
        by: ['churchId'],
        where: { churchId: { in: ids }, deletedAt: null },
        _count: { _all: true },
      }),
    ]);
    const users = new Map(userCounts.map((r) => [r.churchId, r._count._all]));
    const members = new Map(memberCounts.map((r) => [r.churchId, r._count._all]));
    return churches.map((c) => {
      const snap = deriveBilling(c, now);
      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        createdAt: c.createdAt,
        users: users.get(c.id) ?? 0,
        members: members.get(c.id) ?? 0,
        billing: {
          state: snap.state,
          locked: snap.locked,
          coveredUntil: snap.coveredUntil,
          locksAt: snap.locksAt,
          daysLeft: snap.daysLeft,
          graceDaysLeft: snap.graceDaysLeft,
          amountMinor: c.monthlyFeeMinor,
          billingLocked: c.billingLocked,
          billingExempt: c.billingExempt,
        },
      };
    });
  }

  async getChurch(churchId: string) {
    const church = await prisma.church.findUnique({ where: { id: churchId }, select: CHURCH_SELECT });
    if (!church) throw new NotFoundException('church not found');
    const [memberCount, users, payments, auditRows] = await Promise.all([
      prisma.member.count({ where: { churchId, deletedAt: null } }),
      prisma.user.findMany({
        where: { churchId },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          phoneE164: true,
          email: true,
          isActive: true,
          lastLoginAt: true,
          roles: { select: { role: { select: { key: true, name: true } } } },
        },
      }),
      prisma.subscriptionPayment.findMany({
        where: { churchId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.$queryRaw<
        Array<{
          id: bigint;
          action: string;
          entity: string | null;
          entity_id: string | null;
          actor_id: string | null;
          created_at: Date;
        }>
      >`SELECT id, action, entity, entity_id, actor_id, created_at
          FROM audit_event WHERE church_id = ${churchId}::uuid
          ORDER BY seq DESC LIMIT 20`,
    ]);
    const settings = (church.settings ?? {}) as Record<string, unknown>;
    return {
      church: {
        id: church.id,
        name: church.name,
        slug: church.slug,
        createdAt: church.createdAt,
        pastorDisplayName: church.pastorDisplayName,
        modules: resolveModules(settings),
        moduleDefaults: MODULE_DEFAULTS,
        billing: await this.billing.present(church, new Date()),
        billingEmail: church.billingEmail,
        billingPhone: church.billingPhone,
        billingNote: church.billingNote,
      },
      members: memberCount,
      users: users.map((u) => ({
        ...u,
        roles: u.roles.map((r) => r.role),
      })),
      payments,
      audit: auditRows.map((r) => ({ ...r, id: String(r.id) })),
    };
  }

  async createChurch(
    actor: PlatformActor,
    input: { name: string; slug: string; adminName: string; adminPhoneE164: string; adminPassword: string },
    ip?: string,
  ) {
    this.ownerOnly(actor);
    const created = await this.churches.create({
      platformKey: this.env.PLATFORM_SIGNUP_KEY,
      name: input.name,
      slug: input.slug,
      admin: { name: input.adminName, phoneE164: input.adminPhoneE164, password: input.adminPassword },
    });
    await this.audit(created.churchId, actor, 'platform.church.create', 'Church', created.churchId, {
      name: input.name,
      slug: created.slug,
    }, undefined, ip);
    return created;
  }

  async updateChurch(
    actor: PlatformActor,
    churchId: string,
    patch: {
      name?: string;
      pastorDisplayName?: string | null;
      modules?: Partial<Record<ModuleKey, boolean>>;
      monthlyFeeMinor?: number;
      billingDay?: number;
      graceDays?: number;
      billingExempt?: boolean;
      billingLocked?: boolean;
      plan?: string;
      billingEmail?: string | null;
      billingPhone?: string | null;
      billingNote?: string | null;
    },
    ip?: string,
  ) {
    const church = await prisma.church.findUnique({ where: { id: churchId }, select: CHURCH_SELECT });
    if (!church) throw new NotFoundException('church not found');

    const moneyFields = [
      patch.monthlyFeeMinor,
      patch.billingDay,
      patch.graceDays,
      patch.billingExempt,
      patch.billingLocked,
      patch.plan,
    ];
    if (moneyFields.some((v) => v !== undefined)) this.ownerOnly(actor);
    if (patch.billingDay !== undefined && (patch.billingDay < 1 || patch.billingDay > 28)) {
      throw new BadRequestException('billing day must be between 1 and 28');
    }
    if (patch.monthlyFeeMinor !== undefined && patch.monthlyFeeMinor <= 0) {
      throw new BadRequestException('monthly fee must be positive');
    }

    const currentSettings = (church.settings ?? {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    for (const key of ['name', 'pastorDisplayName', 'plan', 'billingEmail', 'billingPhone', 'billingNote'] as const) {
      if (patch[key] !== undefined) data[key] = patch[key];
    }
    for (const key of ['monthlyFeeMinor', 'billingDay', 'graceDays', 'billingExempt', 'billingLocked'] as const) {
      if (patch[key] !== undefined) data[key] = patch[key];
    }
    if (patch.modules) {
      const modules = { ...((currentSettings.modules as Record<string, boolean>) ?? {}) };
      for (const [key, on] of Object.entries(patch.modules)) {
        if (on !== undefined) modules[key] = on;
      }
      data.settings = { ...currentSettings, modules };
    }
    if (patch.billingLocked === true) data.billingPausedAt = new Date();
    if (patch.billingLocked === false) data.billingPausedAt = null;

    const updated = await prisma.church.update({ where: { id: churchId }, data: data as never });
    this.billing.invalidate(churchId);
    await this.audit(
      churchId,
      actor,
      'platform.church.update',
      'Church',
      churchId,
      { ...patch, paidUntil: updated.paidUntil, billingLocked: updated.billingLocked },
      { name: church.name, paidUntil: church.paidUntil, billingLocked: church.billingLocked },
      ip,
    );
    return this.getChurch(churchId);
  }

  // ------------------------------------------------------------------ users
  async listUsers(churchId?: string) {
    const users = await prisma.user.findMany({
      where: churchId ? { churchId } : undefined,
      orderBy: [{ churchId: 'asc' }, { name: 'asc' }],
      take: 500,
      select: {
        id: true,
        churchId: true,
        name: true,
        phoneE164: true,
        email: true,
        isActive: true,
        lastLoginAt: true,
        roles: { select: { role: { select: { key: true, name: true } } } },
      },
    });
    return users.map((u) => ({ ...u, roles: u.roles.map((r) => r.role) }));
  }

  async createUser(
    actor: PlatformActor,
    input: { churchId: string; name: string; phoneE164: string; password: string; roleKeys?: string[] },
    ip?: string,
  ) {
    const church = await prisma.church.findUnique({ where: { id: input.churchId }, select: { id: true } });
    if (!church) throw new NotFoundException('church not found');
    if (input.password.length < 6) throw new BadRequestException('password must be at least 6 characters');
    const phone = normalizeGhPhone(input.phoneE164);
    const roleKeys = (input.roleKeys?.length ? input.roleKeys : ['MEMBER']) as RoleKey[];
    const roles = await prisma.role.findMany({ where: { churchId: input.churchId, key: { in: roleKeys } } });
    if (roles.length !== new Set(roleKeys).size) throw new BadRequestException('unknown role for this church');

    const passwordHash = await bcrypt.hash(input.password, 10);
    const id = uuidv7();
    try {
      await prisma.user.create({
        data: {
          id,
          churchId: input.churchId,
          name: input.name.trim(),
          phoneE164: phone,
          passwordHash,
          roles: { create: roles.map((r) => ({ roleId: r.id })) },
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') {
        throw new ConflictException('a user with that phone already exists in this church');
      }
      throw e;
    }
    await this.audit(input.churchId, actor, 'platform.user.create', 'User', id, {
      name: input.name,
      phone,
      roles: roleKeys,
    }, undefined, ip);
    return { id, name: input.name, phoneE164: phone, roles: roles.map((r) => r.key) };
  }

  async updateUser(
    actor: PlatformActor,
    userId: string,
    patch: { name?: string; phoneE164?: string; isActive?: boolean; email?: string | null },
    ip?: string,
  ) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, churchId: true } });
    if (!user) throw new NotFoundException('user not found');
    const data: Record<string, unknown> = {};
    if (patch.name !== undefined) data.name = patch.name.trim();
    if (patch.phoneE164 !== undefined) data.phoneE164 = normalizeGhPhone(patch.phoneE164);
    if (patch.email !== undefined) data.email = patch.email;
    if (patch.isActive !== undefined) data.isActive = patch.isActive;
    const updated = await prisma.user.update({
      where: { id: userId },
      data: data as never,
      select: { id: true, name: true, phoneE164: true, email: true, isActive: true },
    });
    // A deactivated user must not keep a working session.
    if (patch.isActive === false) {
      await prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await this.audit(user.churchId, actor, 'platform.user.update', 'User', userId, patch, undefined, ip);
    return updated;
  }

  async resetPassword(actor: PlatformActor, userId: string, password: string, ip?: string) {
    if (password.length < 6) throw new BadRequestException('password must be at least 6 characters');
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, churchId: true } });
    if (!user) throw new NotFoundException('user not found');
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    // Never log the password: the audit entry records that it changed.
    await this.audit(user.churchId, actor, 'platform.user.password_reset', 'User', userId, undefined, undefined, ip);
    return { ok: true };
  }

  async setRoles(actor: PlatformActor, userId: string, roleKeys: string[], ip?: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, churchId: true, roles: { select: { role: { select: { key: true } } } } },
    });
    if (!user) throw new NotFoundException('user not found');
    const roles = await prisma.role.findMany({
      where: { churchId: user.churchId, key: { in: roleKeys as RoleKey[] } },
      select: { id: true, key: true },
    });
    if (roles.length !== new Set(roleKeys).size) throw new BadRequestException('unknown role for this church');

    await prisma.$transaction([
      prisma.userRole.deleteMany({ where: { userId } }),
      prisma.userRole.createMany({ data: roles.map((r) => ({ userId, roleId: r.id })) }),
    ]);
    await this.audit(
      user.churchId,
      actor,
      'platform.user.roles',
      'User',
      userId,
      { roles: roles.map((r) => r.key) },
      { roles: user.roles.map((r) => r.role.key) },
      ip,
    );
    return { roles: roles.map((r) => r.key), permissions: permissionsForRoles(roles.map((r) => r.key)) };
  }

  /** One-time link the office opens to work inside a church as this user. */
  async impersonate(actor: PlatformActor, userId: string, ip?: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, churchId: true, name: true, isActive: true },
    });
    if (!user) throw new NotFoundException('user not found');
    if (!user.isActive) throw new BadRequestException('this user is deactivated');
    const jti = uuidv7();
    const token = await this.jwt.signAsync(
      { sub: user.id, cid: user.churchId, jti, aud: 'handoff' },
      { secret: this.env.JWT_SECRET, expiresIn: '90s' },
    );
    await this.audit(user.churchId, actor, 'platform.impersonate', 'User', user.id, { as: user.name }, undefined, ip);
    const web = (this.env.WEB_URL.split(',')[0] ?? '').trim().replace(/\/+$/, '');
    return {
      url: `${web}/handoff?token=${encodeURIComponent(token)}`,
      name: user.name,
      expiresInSec: 90,
    };
  }

  // --------------------------------------------------------------- payments
  listPayments(status?: string) {
    return prisma.subscriptionPayment.findMany({
      where: status ? { status: status as never } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { church: { select: { name: true, slug: true } } },
    });
  }

  async confirmPayment(actor: PlatformActor, paymentId: string, ip?: string) {
    const row = await prisma.subscriptionPayment.findUnique({ where: { id: paymentId } });
    if (!row) throw new NotFoundException('payment not found');
    if (row.method === 'PAYSTACK') {
      throw new BadRequestException('Paystack payments settle from the webhook, not by hand');
    }
    return this.billing.confirmCash(paymentId, { id: actor.id, name: actor.name }, ip);
  }

  cancelPayment(actor: PlatformActor, paymentId: string, ip?: string) {
    return this.billing.cancelPayment(paymentId, actor.id, ip);
  }
}
