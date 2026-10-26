// Church onboarding: platform-key protected bootstrap that creates the church,
// its first SUPER_ADMIN, and applies all Phase 0 seeds in one transaction.
import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { prisma, withTenant, withPlatform, appendAudit } from '@chms/db';
import { seedChurchDefaults } from '@chms/db';
import { normalizeGhPhone, denominationPreset, isModuleKey, resolveModules, type ModuleKey } from '@chms/shared';
import { uuidv7 } from '@chms/shared';
import { timingSafeEqualStr } from '../common/crypto';
import type { Env } from '../env';

export interface CreateChurchInput {
  platformKey: string;
  name: string;
  slug: string;
  pastorDisplayName?: string;
  timezone?: string;
  admin: { name: string; phoneE164: string; password: string };
}

@Injectable()
export class ChurchesService {
  constructor(@Inject('ENV') private readonly env: Env) {}

  create(input: CreateChurchInput): Promise<{ churchId: string; slug: string }> {
    // Constant-time compare: a plain !== leaks the matching prefix length of a
    // platform-wide key through response timing.
    if (!timingSafeEqualStr(input.platformKey, this.env.PLATFORM_SIGNUP_KEY)) {
      throw new ForbiddenException('invalid platform key');
    }
    const phone = normalizeGhPhone(input.admin.phoneE164);
    // Church id: normalized (lowercase, URL-safe) and guaranteed unique —
    // "Demo", "demo " and "demo!" all collapse to the same id.
    const slug = input.slug
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (slug.length < 2) throw new ForbiddenException('church id must be at least 2 characters (letters, digits, dashes)');
    const churchId = uuidv7();
    const userId = uuidv7();

    return withPlatform(async (tx) => {
      const taken = await tx.church.findFirst({ where: { slug } });
      if (taken) throw new ForbiddenException(`church id "${slug}" is already taken`);
      try {
        await tx.church.create({
          data: {
            id: churchId,
            name: input.name,
            slug,
            pastorDisplayName: input.pastorDisplayName ?? null,
            timezone: input.timezone ?? 'Africa/Accra',
          },
        });
      } catch (e) {
        // lower(slug) unique index (extras.sql) can still catch races/case tricks
        if ((e as { code?: string }).code === 'P2003' || (e as { code?: string }).code === '23505' || String(e).includes('unique')) {
          throw new ForbiddenException(`church id "${slug}" is already taken`);
        }
        throw e;
      }
      // Church has no churchId column (no RLS); everything below does — set
      // the tenant context BEFORE the first tenant-scoped write.
      await tx.$executeRaw`SELECT set_config('app.church_id', ${churchId}, true)`;
      await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
      const passwordHash = await bcrypt.hash(input.admin.password, 10);
      await tx.user.create({
        data: { id: userId, churchId, name: input.admin.name, phoneE164: phone, passwordHash },
      });
      const superRole = await tx.role.create({
        data: { churchId, key: 'SUPER_ADMIN', name: 'Super Admin', permissions: ['*'] },
      });
      await tx.userRole.create({ data: { userId, roleId: superRole.id } });
      await tx.onboardingProgress.create({ data: { churchId, accountCreated: true } });
      await appendAudit(tx, {
        churchId,
        actorId: userId,
        action: 'church.create',
        entity: 'Church',
        entityId: churchId,
        after: { name: input.name, slug: input.slug },
      });
      return { churchId, slug: input.slug };
    }).then(async (result) => {
      // Seed defaults in a fresh tenant tx (seedChurchDefaults opens its own).
      await seedChurchDefaults(result.churchId, userId);
      return result;
    });
  }

  async getPublicBySlug(slug: string) {
    const church = await prisma.church.findUnique({
      where: { slug: slug.trim().toLowerCase() },
      select: { id: true, name: true, slug: true, timezone: true, currency: true, pastorDisplayName: true, settings: true, smsSenderId: true },
    });
    if (!church) return null;
    const funds = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.church_id', ${church.id}, true)`;
      return tx.fund.findMany({ where: { churchId: church.id, isActive: true }, select: { id: true, name: true, type: true } });
    });
    const s = (church.settings ?? {}) as any;
    return {
      name: church.name,
      slug: church.slug,
      pastorDisplayName: church.pastorDisplayName,
      smsSenderId: church.smsSenderId,
      branding: s.branding ?? null, // { logoDataUrl?, tagline?, primaryColor? }
      contact: s.contact ?? null, // { phone?, email?, address?, socialUrl? }
      givingInstructions: s.givingInstructions ?? null, // { momoMerchant?, momoNumber?, ussd?, bankName?, bankAccount? }
      funds,
    };
  }

  /** Staff profile: name, logo/branding, contact, giving instructions, sender id. */
  async getProfile(churchId: string) {
    const church = await prisma.church.findUniqueOrThrow({ where: { id: churchId } });
    const s = (church.settings ?? {}) as any;
    return {
      name: church.name,
      slug: church.slug,
      pastorDisplayName: church.pastorDisplayName,
      timezone: church.timezone,
      smsSenderId: church.smsSenderId,
      branding: s.branding ?? {},
      contact: s.contact ?? {},
      givingInstructions: s.givingInstructions ?? {},
      care: s.care ?? { enabled: true, missingSundays: 3, digestPhones: [] },
      smsLocales: s.smsLocales ?? { defaultLocale: 'en', templates: {} },
      // Which areas of the app are switched on for this church (Settings → Modules).
      modules: resolveModules(s),
      denomination: {
        key: s.denominationKey ?? 'DEFAULT',
        terms: s.terminology ?? denominationPreset(s.denominationKey).terms,
      },
      // R4.11 retention policy fields (policy text only — enforcement is an
      // ops job once real data exists).
      retention: s.retention ?? { memberDataYears: 7, transactionYears: 7 },
    };
  }

  /** R4.10 label pack for any staff UI (church:read). */
  terminology(churchId: string) {
    return prisma.church.findUnique({ where: { id: churchId }, select: { settings: true } }).then((c) => {
      const s = (c?.settings ?? {}) as any;
      return {
        key: s.denominationKey ?? 'DEFAULT',
        terms: s.terminology ?? denominationPreset(s.denominationKey).terms,
      };
    });
  }

  saveProfile(
    user: { churchId: string; userId: string },
    patch: {
      name?: string;
      pastorDisplayName?: string | null;
      smsSenderId?: string | null;
      branding?: { logoDataUrl?: string | null; tagline?: string; primaryColor?: string };
      contact?: { phone?: string; email?: string; address?: string; socialUrl?: string };
      givingInstructions?: { momoMerchant?: string; momoNumber?: string; ussd?: string; bankName?: string; bankAccount?: string };
      care?: { enabled?: boolean; missingSundays?: number; digestPhones?: string[] };
      smsLocales?: { defaultLocale?: string; templates?: Record<string, Record<string, string>> };
      denominationKey?: string;
      retention?: { memberDataYears?: number; transactionYears?: number };
      /** Module switches: false hides an area of the app; true/absent shows it. */
      modules?: Partial<Record<ModuleKey, boolean>>;
    },
    ip?: string,
  ) {
    return withTenant(user.churchId, user.userId, async (tx) => {
      const church = await tx.church.findUniqueOrThrow({ where: { id: user.churchId } });
      const prev = (church.settings ?? {}) as any;
      // 300 kB of image ≈ 400 kB once base64-encoded; the JSON body limit is 1 MB,
      // so this is the constraint the user actually hits (with a 400, not a 500).
      if (patch.branding?.logoDataUrl && patch.branding.logoDataUrl.length > 400_000) {
        throw new BadRequestException('logo too large — upload an image under ~300KB (or link an image URL)');
      }
      if (patch.branding?.primaryColor && !/^#[0-9a-fA-F]{3,8}$/.test(patch.branding.primaryColor)) {
        throw new BadRequestException('primaryColor must be a hex color like #1e3a5f');
      }
      const nextSettings = {
        ...prev,
        branding: { ...(prev.branding ?? {}), ...(patch.branding ?? {}) },
        contact: { ...(prev.contact ?? {}), ...(patch.contact ?? {}) },
        givingInstructions: { ...(prev.givingInstructions ?? {}), ...(patch.givingInstructions ?? {}) },
        care: { ...(prev.care ?? {}), ...(patch.care ?? {}) },
        smsLocales: patch.smsLocales !== undefined ? patch.smsLocales : ((prev.smsLocales ?? undefined) as unknown),
        ...(patch.denominationKey !== undefined
          ? {
              denominationKey: patch.denominationKey,
              terminology: denominationPreset(patch.denominationKey).terms,
            }
          : {}),
        ...(patch.retention !== undefined ? { retention: { ...(prev.retention ?? {}), ...patch.retention } } : {}),
        // Module switches merge flag-by-flag; unknown keys and non-booleans are
        // dropped so a malformed body cannot brick the shell.
        ...(patch.modules !== undefined
          ? {
              modules: {
                ...(prev.modules ?? {}),
                ...Object.fromEntries(
                  Object.entries(patch.modules).filter(([key, on]) => isModuleKey(key) && typeof on === 'boolean'),
                ),
              },
            }
          : {}),
      } as Record<string, unknown>;
      await tx.church.update({
        where: { id: user.churchId },
        data: {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.pastorDisplayName !== undefined ? { pastorDisplayName: patch.pastorDisplayName } : {}),
          ...(patch.smsSenderId !== undefined ? { smsSenderId: patch.smsSenderId || null } : {}),
          settings: nextSettings as any,
        },
      });
      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: 'church.profile.update',
        entity: 'Church',
        entityId: user.churchId,
        before: { name: church.name, branding: prev.branding ?? null },
        after: { name: patch.name ?? church.name, branding: nextSettings.branding },
        ip,
      });
      return this.getProfile(user.churchId);
    });
  }

  async getSettings(churchId: string) {
    return withTenant(churchId, null, async (tx) => {
      const church = await tx.church.findUniqueOrThrow({ where: { id: churchId } });
      const giving = await tx.churchGivingSettings.findUnique({ where: { churchId } });
      const wallet = await tx.smsWallet.findUnique({ where: { churchId } });
      const progress = await tx.onboardingProgress.findUnique({ where: { churchId } });
      return { church, giving, wallet, progress };
    });
  }

  /** Devotional (verse-of-the-day) settings — see worker verse-of-day.ts. */
  devotional(churchId: string) {    return withTenant(churchId, null, async (tx) => {
      const church = await tx.church.findUniqueOrThrow({ where: { id: churchId } });
      const d = (church.settings as any)?.devotional ?? {};
      return {
        enabled: d.enabled === true,
        translation: d.translation ?? 'kjv',
        verse: d.verse ?? 'John 3:16',
      };
    });
  }

  saveDevotional(user: { churchId: string; userId: string }, patch: { enabled?: boolean; translation?: string; verse?: string }, ip?: string) {
    return withTenant(user.churchId, user.userId, async (tx) => {
      const church = await tx.church.findUniqueOrThrow({ where: { id: user.churchId } });
      const prev = (church.settings as any)?.devotional ?? {};
      const merged = {
        enabled: patch.enabled ?? prev.enabled ?? false,
        translation: patch.translation ?? prev.translation ?? 'kjv',
        verse: patch.verse ?? prev.verse ?? 'John 3:16',
      };
      await tx.church.update({
        where: { id: user.churchId },
        data: { settings: { ...(church.settings as any), devotional: merged } as any },
      });
      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: 'settings.devotional.update',
        entity: 'Church',
        entityId: user.churchId,
        before: prev,
        after: merged,
        ip,
      });
      return merged;
    });
  }
}
