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
  parseCsv,
  parseCustomFeatures,
  permissionsForRoles,
  resolveModules,
  rowsToObjects,
  uuidv7,
  type CustomFeature,
  type ModuleKey,
  type RoleKey,
} from '@chms/shared';
import { BillingService } from '../billing/billing.service';
import { deriveBilling } from '../billing/billing.logic';
import { ChurchesService } from '../churches/churches.service';
import { buildImportPreview, insertImportRows, type ImportPreview, type ImportRowInput } from '../members/members-import.service';
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

  // --------------------------------------------------------------- the team
  /**
   * Office staff. Only an owner sees or changes this list; onboarders are
   * created here and sign in with their own email, never a church login.
   */
  listStaff(actor: PlatformActor) {
    this.ownerOnly(actor);
    return prisma.platformUser.findMany({
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
    });
  }

  async createStaff(
    actor: PlatformActor,
    input: { name: string; email: string; password: string; role?: string },
  ) {
    this.ownerOnly(actor);
    const email = input.email.trim().toLowerCase();
    const role = this.staffRole(input.role);
    if (input.password.length < 10) throw new BadRequestException('password must be at least 10 characters');
    if (!input.name.trim()) throw new BadRequestException('name is required');
    const passwordHash = await bcrypt.hash(input.password, 12);
    try {
      const created = await prisma.platformUser.create({
        data: { id: uuidv7(), name: input.name.trim(), email, passwordHash, role },
        select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
      });
      return created;
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') {
        throw new ConflictException('someone in the office already uses that email');
      }
      throw e;
    }
  }

  async updateStaff(
    actor: PlatformActor,
    staffId: string,
    patch: { name?: string; role?: string; isActive?: boolean },
  ) {
    this.ownerOnly(actor);
    const staff = await prisma.platformUser.findUnique({ where: { id: staffId } });
    if (!staff) throw new NotFoundException('staff member not found');
    if (staffId === actor.id && patch.isActive === false) {
      throw new BadRequestException('you cannot disable your own account');
    }
    if (staffId === actor.id && patch.role && patch.role.toUpperCase() !== 'OWNER') {
      throw new BadRequestException('you cannot remove your own owner access');
    }
    if (staff.role === 'OWNER' && (patch.isActive === false || (patch.role && patch.role.toUpperCase() !== 'OWNER'))) {
      const otherOwners = await prisma.platformUser.count({
        where: { role: 'OWNER', isActive: true, id: { not: staffId } },
      });
      if (otherOwners === 0) throw new BadRequestException('the office needs at least one active owner');
    }

    const data: Record<string, unknown> = {};
    if (patch.name !== undefined) {
      if (!patch.name.trim()) throw new BadRequestException('name is required');
      data.name = patch.name.trim();
    }
    if (patch.role !== undefined) data.role = this.staffRole(patch.role);
    if (patch.isActive !== undefined) data.isActive = patch.isActive;

    return prisma.platformUser.update({
      where: { id: staffId },
      data: data as never,
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    });
  }

  async resetStaffPassword(actor: PlatformActor, staffId: string, password: string) {
    this.ownerOnly(actor);
    if (password.length < 10) throw new BadRequestException('password must be at least 10 characters');
    const staff = await prisma.platformUser.findUnique({ where: { id: staffId }, select: { id: true } });
    if (!staff) throw new NotFoundException('staff member not found');
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.platformUser.update({ where: { id: staffId }, data: { passwordHash } });
    return { ok: true };
  }

  /** Owners are seeded from the command line; the office can only make onboarders/support. */
  private staffRole(value: string | undefined): 'ONBOARDER' | 'SUPPORT' {
    const role = (value ?? 'ONBOARDER').trim().toUpperCase();
    if (role !== 'ONBOARDER' && role !== 'SUPPORT') {
      throw new BadRequestException('role must be ONBOARDER or SUPPORT');
    }
    return role;
  }

  // -------------------------------------------------------------- overview
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
          billingDay: c.billingDay,
          billingLocked: c.billingLocked,
          billingExempt: c.billingExempt,
        },
      };
    });
  }

  async getChurch(churchId: string) {
    const church = await prisma.church.findUnique({ where: { id: churchId }, select: CHURCH_SELECT });
    if (!church) throw new NotFoundException('church not found');
    const [memberCount, users, payments, auditRows, classes] = await Promise.all([
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
          careClassBracketId: true,
          careClassSegment: true,
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
      prisma.ageBracket.findMany({
        where: { churchId, isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { minAge: 'asc' }],
        select: {
          id: true,
          key: true,
          label: true,
          genderSplit: true,
          maleLabel: true,
          femaleLabel: true,
        },
      }),
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
        customFeatures: parseCustomFeatures(settings.customFeatures).features,
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
      classes,
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
      customFeatures?: Partial<CustomFeature>[];
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
    const nextSettings: Record<string, unknown> = { ...currentSettings };
    if (patch.modules) {
      const modules = { ...((currentSettings.modules as Record<string, boolean>) ?? {}) };
      for (const [key, on] of Object.entries(patch.modules)) {
        if (on !== undefined) modules[key] = on;
      }
      nextSettings.modules = modules;
    }
    if (patch.customFeatures !== undefined) {
      const parsed = parseCustomFeatures(patch.customFeatures);
      if (parsed.error) throw new BadRequestException(parsed.error);
      nextSettings.customFeatures = parsed.features;
    }
    if (patch.modules || patch.customFeatures !== undefined) data.settings = nextSettings;
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

  /**
   * A Sunday School teacher is scoped to one class. Validate the bracket against
   * this church (never accept an id from another tenant) and only allow a gender
   * segment when the bracket is actually split.
   */
  private async careClassData(
    churchId: string,
    bracketId: string | null | undefined,
    segment: string | null | undefined,
  ): Promise<{ careClassBracketId: string | null; careClassSegment: string | null }> {
    if (!bracketId) return { careClassBracketId: null, careClassSegment: null };
    const bracket = await prisma.ageBracket.findFirst({
      where: { id: bracketId, churchId, isActive: true },
      select: { id: true, genderSplit: true },
    });
    if (!bracket) throw new BadRequestException('that class does not belong to this church');
    const value = (segment ?? 'ALL').trim().toUpperCase();
    if (!['ALL', 'MALE', 'FEMALE'].includes(value)) {
      throw new BadRequestException('class segment must be ALL, MALE or FEMALE');
    }
    if (!bracket.genderSplit && value !== 'ALL') {
      throw new BadRequestException('this class is not split into boys and girls');
    }
    return { careClassBracketId: bracket.id, careClassSegment: value };
  }

  async createUser(
    actor: PlatformActor,
    input: {
      churchId: string;
      name: string;
      phoneE164: string;
      password: string;
      roleKeys?: string[];
      careClassBracketId?: string | null;
      careClassSegment?: string | null;
    },
    ip?: string,
  ) {
    const church = await prisma.church.findUnique({ where: { id: input.churchId }, select: { id: true } });
    if (!church) throw new NotFoundException('church not found');
    if (input.password.length < 6) throw new BadRequestException('password must be at least 6 characters');
    const phone = normalizeGhPhone(input.phoneE164);
    const roleKeys = (input.roleKeys?.length ? input.roleKeys : ['MEMBER']) as RoleKey[];
    const roles = await prisma.role.findMany({ where: { churchId: input.churchId, key: { in: roleKeys } } });
    if (roles.length !== new Set(roleKeys).size) throw new BadRequestException('unknown role for this church');
    if (input.careClassBracketId && !roleKeys.includes('SUNDAY_SCHOOL')) {
      throw new BadRequestException('pick the Sunday School teacher role before assigning a class');
    }
    const careClass = roleKeys.includes('SUNDAY_SCHOOL')
      ? await this.careClassData(input.churchId, input.careClassBracketId, input.careClassSegment)
      : { careClassBracketId: null, careClassSegment: null };

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
          ...careClass,
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
      ...careClass,
    }, undefined, ip);
    return { id, name: input.name, phoneE164: phone, roles: roles.map((r) => r.key), ...careClass };
  }

  async updateUser(
    actor: PlatformActor,
    userId: string,
    patch: {
      name?: string;
      phoneE164?: string;
      isActive?: boolean;
      email?: string | null;
      careClassBracketId?: string | null;
      careClassSegment?: string | null;
    },
    ip?: string,
  ) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, churchId: true } });
    if (!user) throw new NotFoundException('user not found');
    const data: Record<string, unknown> = {};
    if (patch.name !== undefined) data.name = patch.name.trim();
    if (patch.phoneE164 !== undefined) data.phoneE164 = normalizeGhPhone(patch.phoneE164);
    if (patch.email !== undefined) data.email = patch.email;
    if (patch.isActive !== undefined) data.isActive = patch.isActive;
    if (patch.careClassBracketId !== undefined || patch.careClassSegment !== undefined) {
      Object.assign(data, await this.careClassData(user.churchId, patch.careClassBracketId, patch.careClassSegment));
    }
    const updated = await prisma.user.update({
      where: { id: userId },
      data: data as never,
      select: {
        id: true,
        name: true,
        phoneE164: true,
        email: true,
        isActive: true,
        careClassBracketId: true,
        careClassSegment: true,
      },
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

  // ---------------------------------------------------------- member import
  /**
   * Onboarding often starts with "here is my list". Preview runs the exact same
   * row rules as the church's own import screen; nothing is written until the
   * office confirms the rows it wants.
   */
  async previewMembers(churchId: string, csvText: string): Promise<ImportPreview> {
    const church = await prisma.church.findUnique({ where: { id: churchId }, select: { id: true } });
    if (!church) throw new NotFoundException('church not found');
    let parsed: ReturnType<typeof parseCsv>;
    try {
      parsed = parseCsv(csvText);
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'invalid CSV');
    }
    const existing = await prisma.member.findMany({
      where: { churchId, deletedAt: null },
      select: { phoneE164: true, memberNo: true },
    });
    const phones = new Set<string>();
    const nos = new Set<string>();
    for (const m of existing) {
      if (m.phoneE164) phones.add(m.phoneE164);
      nos.add(m.memberNo);
    }
    return buildImportPreview(rowsToObjects(parsed), phones, nos);
  }

  async confirmMembers(actor: PlatformActor, churchId: string, rows: ImportRowInput[], ip?: string) {
    const church = await prisma.church.findUnique({ where: { id: churchId }, select: { id: true } });
    if (!church) throw new NotFoundException('church not found');
    if (!Array.isArray(rows) || rows.length === 0) throw new BadRequestException('no rows to import');
    if (rows.length > 5000) throw new BadRequestException('import limited to 5000 rows per call');
    return withPlatform(async (tx) => {
      const { imported, failures } = await insertImportRows(tx, churchId, rows);
      await appendAudit(tx, {
        churchId,
        actorId: actor.id,
        action: 'platform.member.import',
        entity: 'ImportJob',
        after: { requested: rows.length, imported, failed: failures.length, by: actor.email },
        ip,
      });
      return { imported, failed: failures.length, failures };
    });
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
