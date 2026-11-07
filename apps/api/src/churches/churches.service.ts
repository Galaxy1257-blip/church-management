// Church onboarding: platform-key protected bootstrap that creates the church,
// its first SUPER_ADMIN, and applies all Phase 0 seeds in one transaction.
import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { prisma, withTenant, withPlatform, appendAudit } from '@chms/db';
import { seedChurchDefaults } from '@chms/db';
import {
  normalizeGhPhone,
  denominationPreset,
  givingStopsWithBooks,
  isModuleKey,
  MODULE_DEFAULTS,
  resolveDevotional,
  resolveModules,
  resolveSmsQuietHours,
  type DevotionalSettings,
  type ModuleKey,
  type SmsQuietHours,
} from '@chms/shared';
import { uuidv7 } from '@chms/shared';
import { timingSafeEqualStr } from '../common/crypto';
import { ModuleFlagsService } from '../common/module-flags';
import { trialEndsAt } from '../billing/billing.logic';
import { allocateMemberNo } from '../common/member-no';
import { resolveMemberBracket } from '../members/members.service';
import type { Env } from '../env';

export interface SelfServeChurchInput {
  name: string;
  slug: string;
  pastorDisplayName?: string;
  timezone?: string;
  admin: { name: string; phoneE164: string; password: string };
}

export interface CreateChurchInput extends SelfServeChurchInput {
  platformKey: string;
}

export interface CreatedChurch {
  churchId: string;
  slug: string;
  userId: string;
}

const JOIN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** An 8-character code, no look-alike letters (0/O, 1/I) so it can be read aloud. */
export function makeJoinCode(): string {
  return Array.from({ length: 8 }, () => JOIN_ALPHABET[randomInt(0, JOIN_ALPHABET.length)]).join('');
}

/**
 * The one gate for self-add. `off` means the church has not switched it on; `bad`
 * means the code does not match. Compared case-insensitively and trimmed, because
 * people type it from a WhatsApp message.
 */
export function joinGate(settings: unknown, code: string): 'ok' | 'off' | 'bad' {
  const s = (settings ?? {}) as { memberJoin?: { enabled?: boolean; code?: string } };
  if (s.memberJoin?.enabled !== true || !s.memberJoin.code) return 'off';
  return (code ?? '').trim().toUpperCase() === s.memberJoin.code ? 'ok' : 'bad';
}

@Injectable()
export class ChurchesService {
  constructor(
    @Inject('ENV') private readonly env: Env,
    private readonly moduleFlags: ModuleFlagsService,
  ) {}

  create(input: CreateChurchInput): Promise<CreatedChurch> {
    // Constant-time compare: a plain !== leaks the matching prefix length of a
    // platform-wide key through response timing.
    if (!timingSafeEqualStr(input.platformKey, this.env.PLATFORM_SIGNUP_KEY)) {
      throw new ForbiddenException('invalid platform key');
    }
    return this.insert(input);
  }

  /** Sign-up "Create a new church": no platform key, same 14-day trial start. */
  createSelfServe(input: SelfServeChurchInput): Promise<CreatedChurch> {
    return this.insert(input);
  }

  private async insert(input: SelfServeChurchInput): Promise<CreatedChurch> {
    const phone = normalizeGhPhone(input.admin.phoneE164);
    const name = input.name.trim().replace(/\s+/g, ' ');
    if (name.length < 2) throw new BadRequestException('church name is required');
    // Church id: normalized (lowercase, URL-safe) and guaranteed unique —
    // "Demo", "demo " and "demo!" all collapse to the same id.
    const slug = input.slug
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (slug.length < 2) throw new BadRequestException('church id must be at least 2 characters (letters, digits, dashes)');
    const churchId = uuidv7();
    const userId = uuidv7();

    await withPlatform(async (tx) => {
      const taken = await tx.church.findFirst({ where: { slug } });
      if (taken) throw new ForbiddenException(`church id "${slug}" is already taken`);
      try {
        await tx.church.create({
          data: {
            id: churchId,
            name,
            slug,
            pastorDisplayName: input.pastorDisplayName ?? null,
            timezone: input.timezone ?? 'Africa/Accra',
            // Every new church starts with two weeks free; after that the
            // monthly subscription (plus grace) keeps the workspace open.
            trialEndsAt: trialEndsAt(new Date()),
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
        after: { name, slug },
      });
    });
    // Seed defaults in a fresh tenant tx (seedChurchDefaults opens its own).
    await seedChurchDefaults(churchId, userId);
    return { churchId, slug, userId };
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
      // The office closed the books AND answered "stop online giving too".
      givingClosed: !resolveModules(s).money && givingStopsWithBooks(s),
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
      /** Members may send notices + prayer requests with photos from the companion. */
      memberPosts: s.memberPosts === true,
      smsLocales: s.smsLocales ?? { defaultLocale: 'en', templates: {} },
      /** When marketing-style SMS must not go out (20:00–08:00 by default, on). */
      smsQuietHours: resolveSmsQuietHours(s),
      // Which areas of the app are switched on for this church (Settings → Modules).
      // The same resolveModules() the API guard uses, so the shell and the guard
      // can never disagree about what is on.
      modules: resolveModules(s),
      /** The answer Settings asked when Offerings was switched off: give link open or closed. */
      moneyOffStopsGiving: givingStopsWithBooks(s),
      // What a new church starts with, so Settings can label "part of every week"
      // versus "add when your church runs it" without keeping its own copy.
      moduleDefaults: MODULE_DEFAULTS,
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
      /** Answer to the Offerings prompt: stop the public give link with the books. */
      moneyOffStopsGiving?: boolean;
      /** Members may send notices and prayer requests (with photos) from the companion. */
      memberPosts?: boolean;
      /** Quiet hours for marketing-style SMS: window + on/off (default 20:00–08:00, on). */
      smsQuietHours?: Partial<SmsQuietHours>;
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
        ...(patch.memberPosts !== undefined ? { memberPosts: patch.memberPosts === true } : {}),
        ...(patch.moneyOffStopsGiving !== undefined ? { moneyOffStopsGiving: patch.moneyOffStopsGiving === true } : {}),
        ...(patch.smsQuietHours !== undefined ? { smsQuietHours: resolveSmsQuietHours({ smsQuietHours: patch.smsQuietHours }) } : {}),
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
    }).then((profile) => {
      // After the commit, so the API guard stops serving the old flags at once.
      // Invalidating inside the transaction would let a concurrent request
      // re-populate the cache with the pre-save values.
      if (patch.modules !== undefined || patch.moneyOffStopsGiving !== undefined) this.moduleFlags.invalidate(user.churchId);
      return profile;
    });
  }

  /** The join code for the office: shown in Settings, rotate-able. */
  async joinSettings(churchId: string) {
    const church = await prisma.church.findUniqueOrThrow({ where: { id: churchId }, select: { settings: true } });
    const s = (church.settings ?? {}) as { memberJoin?: { enabled?: boolean; code?: string } };
    return { enabled: s.memberJoin?.enabled === true, code: s.memberJoin?.code ?? '' };
  }

  /** The code plus the public link, for the door team's QR. */
  async joinLink(churchId: string) {
    const church = await prisma.church.findUniqueOrThrow({ where: { id: churchId }, select: { slug: true, name: true, settings: true } });
    const s = (church.settings ?? {}) as { memberJoin?: { enabled?: boolean; code?: string } };
    return { enabled: s.memberJoin?.enabled === true, code: s.memberJoin?.code ?? '', slug: church.slug, name: church.name };
  }

  async setJoinSettings(user: { churchId: string; userId: string }, patch: { enabled?: boolean; rotate?: boolean }, ip?: string) {
    return withTenant(user.churchId, user.userId, async (tx) => {
      const church = await tx.church.findUniqueOrThrow({ where: { id: user.churchId } });
      const prev = (church.settings ?? {}) as any;
      const current = prev.memberJoin ?? {};
      const code = patch.rotate || !current.code ? makeJoinCode() : current.code;
      const enabled = patch.enabled !== undefined ? patch.enabled === true : current.enabled === true;
      const settings = { ...prev, memberJoin: { enabled, code } };
      await tx.church.update({ where: { id: user.churchId }, data: { settings } });
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: 'church.join-code', entity: 'Church', entityId: user.churchId, ip });
      return { enabled, code };
    });
  }

  /** Public: what the join page may show before the code is typed. */
  async joinInfo(slug: string) {
    const church = await prisma.church.findUnique({ where: { slug }, select: { name: true, settings: true } });
    if (!church) return null;
    const s = (church.settings ?? {}) as { memberJoin?: { enabled?: boolean } };
    return { name: church.name, enabled: s.memberJoin?.enabled === true };
  }

  /** Public: a member adds themselves with the church's code. */
  joinChurch(
    slug: string,
    input: { code?: string; firstName?: string; lastName?: string; phoneE164?: string; dob?: string },
    ip?: string,
  ) {
    return prisma.church.findUnique({ where: { slug }, select: { id: true, settings: true } }).then(async (church) => {
      if (!church) throw new BadRequestException('That church does not exist.');
      const gate = joinGate(church.settings, String(input.code ?? ''));
      if (gate === 'off') throw new ForbiddenException('This church is not taking sign-ups from the app yet.');
      if (gate === 'bad') throw new ForbiddenException('That code is not right — ask your church office for the code.');
      const firstName = String(input.firstName ?? '').trim();
      const lastName = String(input.lastName ?? '').trim();
      const phone = normalizeGhPhone(String(input.phoneE164 ?? ''));
      if (firstName.length < 2 || lastName.length < 2) throw new BadRequestException('Write your first and last name.');
      if (!phone) throw new BadRequestException('That phone number does not look right.');
      return withTenant(church.id, null, async (tx) => {
        const existing = await tx.member.findFirst({ where: { churchId: church.id, phoneE164: phone, deletedAt: null }, select: { id: true } });
        if (existing) throw new BadRequestException('That phone is already on the church list — sign in instead.');
        const memberNo = await allocateMemberNo(tx, church.id);
        const { ageBracketId } = await resolveMemberBracket(tx, church.id, { dob: input.dob ?? null });
        const m = await tx.member.create({
          data: {
            churchId: church.id,
            memberNo,
            firstName,
            lastName,
            phoneE164: phone,
            dob: input.dob ? new Date(`${input.dob.slice(0, 10)}T00:00:00Z`) : null,
            ageBracketId,
            joinedAt: new Date(),
            smsConsent: true,
            smsConsentAt: new Date(),
          },
        });
        await appendAudit(tx, { churchId: church.id, actorId: m.id, action: 'member.join', entity: 'Member', entityId: m.id, ip });
        return { ok: true, memberNo: m.memberNo };
      });
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

  /** Devotional settings — the 8pm SMS and the in-app daily reading. */
  devotional(churchId: string) {
    return withTenant(churchId, null, async (tx) => {
      const church = await tx.church.findUniqueOrThrow({ where: { id: churchId } });
      return resolveDevotional((church.settings as any)?.devotional);
    });
  }

  saveDevotional(user: { churchId: string; userId: string }, patch: Partial<DevotionalSettings>, ip?: string) {
    return withTenant(user.churchId, user.userId, async (tx) => {
      const church = await tx.church.findUniqueOrThrow({ where: { id: user.churchId } });
      const prev = resolveDevotional((church.settings as any)?.devotional);
      const merged: DevotionalSettings = {
        enabled: patch.enabled ?? prev.enabled,
        translation: patch.translation ?? prev.translation,
        verse: patch.verse ?? prev.verse,
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
