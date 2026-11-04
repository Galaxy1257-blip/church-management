// Member self-service portal: OTP login bound to a Member record (no staff
// account needed), my-giving history, giving statement (JSON/print-ready).
import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Injectable, Module, Param, Patch, Post, Query, Req, UnauthorizedException } from '@nestjs/common';
import { createHash, randomInt } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { prisma, withTenant } from '@chms/db';
import { normalizeGhPhone, resolveModules, uuidv7, localizedSmsBody } from '@chms/shared';
import { Public } from '../common/decorators';
import { normalizePhotoDataUrl } from '../common/photo';
import { openNote } from '../ministry/crypto';
import { BibleModule } from '../bible/bible.module';
import { BibleNotesService } from '../bible/bible-notes';

const OTP_TTL = 10 * 60_000;

/**
 * Member posts are on only when the church switched them on AND the News section
 * is on — a notice has nowhere to appear with News switched off, and the leaders'
 * approval queue lives on that page. The portal refuses the write itself, so the
 * switch is a boundary, not a hidden button.
 */
export function memberPostsOn(settings: unknown): boolean {
  const s = (settings ?? {}) as { memberPosts?: unknown; modules?: { reach?: unknown } };
  return s.memberPosts === true && s.modules?.reach !== false;
}

@Injectable()
export class PortalService {
  constructor(private readonly jwt: JwtService) {}

  private portalSecret(): string {
    return `${process.env.JWT_SECRET}:portal`;
  }

  async requestOtp(churchSlug: string, phoneE164: string): Promise<void> {
    const phone = normalizeGhPhone(phoneE164);
    const church = await prisma.church.findUnique({ where: { slug: churchSlug } });
    if (!church) return;
    const member = await withTenant(church.id, null, (tx) =>
      tx.member.findFirst({ where: { churchId: church.id, phoneE164: phone, deletedAt: null } }),
    );
    if (!member) return;
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await withTenant(church.id, null, async (tx) => {
      await tx.otpChallenge.create({
        data: {
          churchId: church.id,
          phoneE164: phone,
          codeHash: createHash('sha256').update(`${code}:portal:${process.env.JWT_SECRET}`).digest('hex'),
          expiresAt: new Date(Date.now() + OTP_TTL),
        },
      });
      const wallet = await tx.smsWallet.findUnique({ where: { churchId: church.id } });
      if ((wallet?.balanceUnits ?? 0) >= 1) {
        await tx.smsWallet.update({
          where: { churchId: church.id },
          data: { balanceUnits: { decrement: 1 }, reservedUnits: { increment: 1 } },
        });
        await tx.smsLedger.create({
          data: {
            churchId: church.id,
            delta: -1,
            reason: 'RESERVE',
            balanceAfter: (wallet?.balanceUnits ?? 1) - 1,
            idempotencyKey: `reserve:portal:${member.id}:${Date.now()}`,
          },
        });
        await tx.smsLog.create({
          data: {
            churchId: church.id,
            source: 'OTP',
            toE164: phone,
            body: localizedSmsBody('portalOtp', ((church.settings ?? {}) as any).smsLocales, {
              code,
              ttlMinutes: Math.round(OTP_TTL / 60_000),
            }),
            segments: 1,
            status: 'QUEUED',
            idempotencyKey: `portal-otp:${member.id}:${Date.now()}`,
          },
        });
      }
    });
  }

  async verifyOtp(churchSlug: string, phoneE164: string, code: string): Promise<{ token: string }> {
    const phone = normalizeGhPhone(phoneE164);
    const church = await prisma.church.findUnique({ where: { slug: churchSlug } });
    if (!church) throw new UnauthorizedException('invalid code');
    const hash = createHash('sha256').update(`${code}:portal:${process.env.JWT_SECRET}`).digest('hex');
    const member = await withTenant(church.id, null, async (tx) => {
      const ch = await tx.otpChallenge.findFirst({
        where: { churchId: church.id, phoneE164: phone, codeHash: hash, consumedAt: null },
        orderBy: { id: 'desc' },
      });
      if (!ch || ch.expiresAt < new Date()) return null;
      await tx.otpChallenge.update({ where: { id: ch.id }, data: { consumedAt: new Date() } });
      return tx.member.findFirst({ where: { churchId: church.id, phoneE164: phone, deletedAt: null } });
    });
    if (!member) throw new UnauthorizedException('invalid code');
    const token = await this.jwt.signAsync(
      { sub: member.id, cid: church.id, aud: 'portal' },
      { secret: this.portalSecret(), expiresIn: '30d' },
    );
    return { token };
  }

  async portalUser(token: string): Promise<{ member: any; churchId: string }> {
    let claims: { sub: string; cid: string };
    try {
      claims = await this.jwt.verifyAsync(token, { secret: this.portalSecret(), audience: 'portal' });
    } catch {
      throw new UnauthorizedException('invalid portal token');
    }
    const member = await withTenant(claims.cid, null, (tx) =>
      tx.member.findUnique({
        where: { id: claims.sub },
        select: { id: true, firstName: true, lastName: true, memberNo: true, phoneE164: true, dob: true, churchId: true },
      }),
    );
    if (!member) throw new UnauthorizedException('invalid portal token');
    return { member, churchId: member.churchId };
  }

  async myGiving(token: string) {
    const { member, churchId } = await this.portalUser(token);
    const rows = await withTenant(churchId, null, (tx) =>
      tx.transaction.findMany({
        where: {
          churchId,
          OR: [{ memberId: member.id }, { giverPhoneE164: member.phoneE164 }],
          status: 'SUCCESS',
        },
        orderBy: { paidAt: 'desc' },
        take: 200,
        include: { fund: { select: { name: true } } },
      }),
    );
    return rows.map((r) => ({
      date: r.paidAt,
      fund: r.fund.name,
      amountMinor: r.giftMinor,
      reference: r.reference,
      channel: r.channel,
    }));
  }

  /** R4.11 export-my-data (Act 843): the member's own data, via portal token. */
  async exportData(token: string) {
    const { member, churchId } = await this.portalUser(token);
    const data = await withTenant(churchId, null, async (tx) => ({
      attendance: await tx.attendance.findMany({
        where: { churchId, memberId: member.id },
        orderBy: { checkedInAt: 'desc' },
        take: 500,
        select: { checkedInAt: true, method: true, serviceId: true },
      }),
      transactions: await tx.transaction.findMany({
        where: { churchId, OR: [{ memberId: member.id }, { giverPhoneE164: member.phoneE164 }] },
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: { reference: true, giftMinor: true, status: true, createdAt: true },
      }),
      groups: await tx.groupMember.findMany({ where: { memberId: member.id }, select: { groupId: true } }),
      prayerRequests: await tx.prayerRequest.findMany({
        where: { churchId, memberId: member.id },
        select: { body: true, isAnonymous: true, createdAt: true },
      }),
      pastoralActions: await tx.pastoralAction.findMany({
        where: { churchId, memberId: member.id },
        select: { type: true, actionDate: true, note: true },
      }),
    }));
    return {
      exportedAt: new Date().toISOString(),
      subject: 'Act 843 export-my-data (member companion)',
      member,
      ...data,
    };
  }

  /**
   * One year of a member's giving, as the statement they are told they can
   * download.
   *
   * This deliberately does not reuse my-giving: that page stops at 200 rows, and
   * a statement built from a truncated page reports a total that is too small
   * with nothing on the paper to say so. Here the year is filtered in the
   * database, so the rows and the total are the same set of gifts.
   */
  async statement(token: string, year: number) {
    const { member, churchId } = await this.portalUser(token);
    const { from, to } = statementWindow(year);
    const rows = await withTenant(churchId, null, (tx) =>
      tx.transaction.findMany({
        where: {
          churchId,
          OR: [{ memberId: member.id }, { giverPhoneE164: member.phoneE164 }],
          status: 'SUCCESS',
          paidAt: { gte: from, lt: to },
        },
        orderBy: { paidAt: 'asc' },
        include: { fund: { select: { name: true } } },
      }),
    );
    return {
      year,
      rows: rows.map((r) => ({
        date: r.paidAt,
        fund: r.fund.name,
        amountMinor: r.giftMinor,
        reference: r.reference,
        channel: r.channel,
      })),
      totalMinor: rows.reduce((a, r) => a + r.giftMinor, 0),
    };
  }

  /** Companion home: upcoming services + announcements (member view). */
  async home(token: string) {
    const { member, churchId } = await this.portalUser(token);
    const church = await prisma.church.findUnique({ where: { id: churchId } });
    const { services, announcements } = await withTenant(churchId, null, async (tx) => ({
      services: await tx.service.findMany({
        where: { startsAt: { gte: new Date() }, status: { not: 'CLOSED' } },
        orderBy: { startsAt: 'asc' },
        take: 4,
        select: { id: true, name: true, startsAt: true, status: true },
      }),
      announcements: await tx.announcement.findMany({
        where: {
          churchId,
          moderation: 'APPROVED',
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: { publishAt: 'desc' },
        take: 5,
        select: { id: true, title: true, body: true, publishAt: true, photoDataUrl: true },
      }),
    }));
    const s = (church?.settings ?? {}) as any;
    return {
      member: { firstName: member.firstName, lastName: member.lastName, memberNo: member.memberNo },
      church: church
        ? {
            name: church.name,
            slug: church.slug,
            pastorDisplayName: church.pastorDisplayName,
            branding: s.branding ?? null,
            givingInstructions: s.givingInstructions ?? null,
            contact: s.contact ?? null,
          }
        : null,
      services,
      announcements,
      // The church switched the Bible panel off in Settings → App sections, so
      // the companion app must not show the button either.
      bibleOn: resolveModules(church?.settings).bible !== false,
      memberPostsOn: memberPostsOn(church?.settings),
      links: { give: `/give/${church?.slug ?? ''}`, bible: '/bible' },
    };
  }

  /** My volunteer shifts (roster) with service names. */
  async shifts(token: string) {
    const { member, churchId } = await this.portalUser(token);
    return withTenant(churchId, null, async (tx) => {
      const shifts = await tx.rosterShift.findMany({
        where: { churchId, memberId: member.id },
        take: 50,
      });
      const serviceIds = [...new Set(shifts.map((s) => s.serviceId))];
      const services = await tx.service.findMany({
        where: { id: { in: serviceIds } },
        select: { id: true, name: true, startsAt: true, status: true },
      });
      const byId = new Map(services.map((s) => [s.id, s]));
      return shifts.map((s) => ({ ...s, service: byId.get(s.serviceId) ?? null }));
    });
  }

  async events(token: string) {
    const { churchId } = await this.portalUser(token);
    return withTenant(churchId, null, async (tx) =>
      tx.event.findMany({
        where: { churchId, startsAt: { gte: new Date(Date.now() - 86400_000) }, status: 'PUBLISHED' },
        orderBy: { startsAt: 'asc' },
        take: 20,
        select: { id: true, title: true, description: true, startsAt: true, venue: true, capacity: true, feeMinor: true },
      }),
    );
  }

  async rsvp(token: string, eventId: string, partySize: number) {
    const { member, churchId } = await this.portalUser(token);
    return withTenant(churchId, null, async (tx) => {
      const event = await tx.event.findFirst({ where: { id: eventId, churchId } });
      if (!event) throw new Error('event not found');
      let status: 'GOING' | 'WAITLIST' = 'GOING';
      if (event.capacity) {
        const sum = await tx.eventRsvp.aggregate({
          where: { eventId, status: { in: ['GOING', 'WAITLIST'] } },
          _sum: { partySize: true },
        });
        if ((sum._sum.partySize ?? 0) + partySize > event.capacity) status = 'WAITLIST';
      }
      const existing = await tx.eventRsvp.findFirst({ where: { eventId, memberId: member.id } });
      if (existing) {
        const updated = await tx.eventRsvp.update({ where: { id: existing.id }, data: { partySize, status } });
        return { id: updated.id, status };
      }
      const row = await tx.eventRsvp.create({
        data: { id: uuidv7(), churchId, eventId, memberId: member.id, partySize, status, qrToken: uuidv7() },
      });
      return { id: row.id, status, qrToken: row.qrToken };
    });
  }

  async prayer(token: string, body: string, anonymous: boolean, photoDataUrl?: string) {
    const { member, churchId } = await this.portalUser(token);
    if (!body || body.trim().length < 3) throw new Error('prayer request too short');
    const church = await prisma.church.findUnique({ where: { id: churchId }, select: { settings: true } });
    const photo = photoDataUrl ? normalizePhotoDataUrl(photoDataUrl) : null;
    if (photo && !memberPostsOn(church?.settings)) {
      throw new ForbiddenException('Sending a photo with a prayer request has not been switched on by your church.');
    }
    return withTenant(churchId, null, async (tx) =>
      tx.prayerRequest.create({
        data: {
          churchId,
          memberId: member.id,
          body: body.trim(),
          isAnonymous: anonymous,
          shareToWall: true,
          visibility: 'FOLLOWUP_TEAM',
          moderation: 'PENDING',
          ...(photo ? { photoDataUrl: photo } : {}),
        },
      }),
    );
  }

  /** What the leaders have broadcast or scheduled, once it is due. */
  async notifications(token: string) {
    const { member, churchId } = await this.portalUser(token);
    return withTenant(churchId, null, async (tx) => {
      const items = await tx.notification.findMany({
        where: { churchId, scheduledFor: { lte: new Date() }, OR: [{ memberId: null }, { memberId: member.id }] },
        orderBy: { scheduledFor: 'desc' },
        take: 50,
        select: { id: true, kind: true, title: true, body: true, scheduledFor: true, readAt: true },
      });
      return { items, unread: items.filter((i) => !i.readAt).length };
    });
  }

  async readNotifications(token: string, ids?: string[]) {
    const { member, churchId } = await this.portalUser(token);
    return withTenant(churchId, null, async (tx) => {
      const res = await tx.notification.updateMany({
        where: {
          churchId,
          readAt: null,
          OR: [{ memberId: null }, { memberId: member.id }],
          ...(ids && ids.length ? { id: { in: ids } } : {}),
        },
        data: { readAt: new Date() },
      });
      return { read: res.count };
    });
  }

  /** Welfare requests the leaders handed to this member to help with. */
  async assignedWelfare(token: string) {
    const { member, churchId } = await this.portalUser(token);
    const rows = await withTenant(churchId, null, (tx) =>
      tx.welfareRequest.findMany({
        where: { churchId, assignedToMemberId: member.id, status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    );
    const asked = [...new Set(rows.map((r) => r.memberId))];
    const people = asked.length
      ? await withTenant(churchId, null, (tx) =>
          tx.member.findMany({ where: { churchId, id: { in: asked } }, select: { id: true, firstName: true, lastName: true } }),
        )
      : [];
    const byId = new Map(people.map((p) => [p.id, p]));
    return withTenant(churchId, null, async (tx) =>
      Promise.all(
        rows.map(async (r) => ({
          id: r.id,
          category: r.category,
          status: r.status,
          amountRequestedMinor: r.amountRequestedMinor,
          createdAt: r.createdAt,
          description: await openNote(tx, churchId, { cipher: r.descriptionCipher, nonce: r.nonce, keyVersion: r.keyVersion }),
          member: byId.get(r.memberId) ?? null,
        })),
      ),
    );
  }

  /** A member's own notices, with where each one stands. */
  async myPosts(token: string) {
    const { member, churchId } = await this.portalUser(token);
    return withTenant(churchId, null, (tx) =>
      tx.announcement.findMany({
        where: { churchId, submittedByMemberId: member.id },
        orderBy: { publishAt: 'desc' },
        take: 20,
        select: { id: true, title: true, body: true, moderation: true, publishAt: true, photoDataUrl: true },
      }),
    );
  }

  /**
   * A notice sent in from the companion. It waits for a leader: only an approved
   * one is shown to everybody (portal home, staff news list).
   */
  async submitPost(token: string, input: { title?: unknown; body?: unknown; photoDataUrl?: unknown }) {
    const { member, churchId } = await this.portalUser(token);
    const church = await prisma.church.findUnique({ where: { id: churchId }, select: { settings: true } });
    if (!memberPostsOn(church?.settings)) {
      throw new ForbiddenException('Your church has not switched on notices from members yet.');
    }
    const title = String(input.title ?? '').trim();
    const body = String(input.body ?? '').trim();
    if (title.length < 3 || title.length > 120) throw new Error('the title needs 3 to 120 characters');
    if (body.length < 3 || body.length > 2000) throw new Error('the notice needs 3 to 2000 characters');
    const photo = input.photoDataUrl ? normalizePhotoDataUrl(String(input.photoDataUrl)) : null;
    const row = await withTenant(churchId, null, (tx) =>
      tx.announcement.create({
        data: {
          churchId,
          title,
          body,
          category: 'GENERAL',
          channels: ['INAPP'],
          audience: {} as never,
          moderation: 'PENDING',
          submittedByMemberId: member.id,
          createdBy: member.id,
          ...(photo ? { photoDataUrl: photo } : {}),
        },
      }),
    );
    return { id: row.id, moderation: row.moderation };
  }

  /** Member answers their own roster shift (portal token, not staff JWT). */
  async respondShift(token: string, shiftId: string, status: 'CONFIRMED' | 'DECLINED') {
    const { member, churchId } = await this.portalUser(token);
    return withTenant(churchId, null, async (tx) => {
      const shift = await tx.rosterShift.findFirst({ where: { id: shiftId, churchId, memberId: member.id } });
      if (!shift) throw new Error('shift not found');
      return tx.rosterShift.update({ where: { id: shiftId }, data: { status } });
    });
  }
}


/**
 * The two instants a year of giving runs between. Kept apart so the boundary is
 * a fact someone can check rather than a filter buried in a query.
 */
export function statementWindow(year: number): { from: Date; to: Date } {
  return { from: new Date(Date.UTC(year, 0, 1)), to: new Date(Date.UTC(year + 1, 0, 1)) };
}

function bearer(req: any): string {
  return String(req.headers.authorization ?? '').replace(/^Bearer /, '');
}

@Controller('portal')
export class PortalController {
  constructor(private readonly svc: PortalService, private readonly notes: BibleNotesService) {}

  @Public()
  @Post('otp/request')
  @HttpCode(202)
  async requestOtp(@Body() body: { churchSlug: string; phoneE164: string }) {
    await this.svc.requestOtp(body.churchSlug, body.phoneE164);
    return { accepted: true };
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(200)
  verifyOtp(@Body() body: { churchSlug: string; phoneE164: string; code: string }) {
    return this.svc.verifyOtp(body.churchSlug, body.phoneE164, body.code);
  }

  @Public()
  @Get('me')
  async me(@Req() req: any) {
    const { member, churchId } = await this.svc.portalUser(bearer(req));
    const church = await prisma.church.findUnique({ where: { id: churchId }, select: { name: true, slug: true } });
    return { member: { ...member, churchId: undefined }, church };
  }

  @Public()
  @Get('my-giving')
  myGiving(@Req() req: any) {
    return this.svc.myGiving(bearer(req));
  }

  @Public()
  @Get('statement')
  statement(@Req() req: any, @Query('year') year?: string) {
    return this.svc.statement(bearer(req), Number(year ?? new Date().getUTCFullYear()));
  }

  @Public()
  @Get('home')
  home(@Req() req: any) {
    return this.svc.home(bearer(req));
  }

  @Public()
  @Get('export')
  exportData(@Req() req: any) {
    return this.svc.exportData(bearer(req));
  }

  @Public()
  @Get('shifts')
  shifts(@Req() req: any) {
    return this.svc.shifts(bearer(req));
  }

  @Public()
  @Get('events')
  events(@Req() req: any) {
    return this.svc.events(bearer(req));
  }

  @Public()
  @Post('events/:id/rsvp')
  @HttpCode(200)
  rsvp(@Req() req: any, @Param('id') id: string, @Body() body: { partySize?: number }) {
    return this.svc.rsvp(bearer(req), id, Math.max(1, Math.min(20, Number(body?.partySize ?? 1))));
  }

  @Public()
  @Post('prayer')
  @HttpCode(200)
  prayer(@Req() req: any, @Body() body: { body: string; anonymous?: boolean; photoDataUrl?: string }) {
    return this.svc.prayer(bearer(req), String(body?.body ?? ''), body?.anonymous === true, body?.photoDataUrl);
  }

  @Public()
  @Get('notifications')
  notifications(@Req() req: any) {
    return this.svc.notifications(bearer(req));
  }

  @Public()
  @Post('notifications/read')
  @HttpCode(200)
  readNotifications(@Req() req: any, @Body() body: { ids?: string[] }) {
    return this.svc.readNotifications(bearer(req), Array.isArray(body?.ids) ? body.ids : undefined);
  }

  @Public()
  @Get('welfare-assigned')
  assignedWelfare(@Req() req: any) {
    return this.svc.assignedWelfare(bearer(req));
  }

  @Public()
  @Get('posts')
  myPosts(@Req() req: any) {
    return this.svc.myPosts(bearer(req));
  }

  @Public()
  @Post('posts')
  @HttpCode(202)
  submitPost(@Req() req: any, @Body() body: { title?: unknown; body?: unknown; photoDataUrl?: unknown }) {
    return this.svc.submitPost(bearer(req), body ?? {});
  }

  @Public()
  @Post('shifts/:id/respond')
  @HttpCode(200)
  respondShift(@Req() req: any, @Param('id') id: string, @Body() body: { status: 'CONFIRMED' | 'DECLINED' }) {
    return this.svc.respondShift(bearer(req), id, body?.status === 'DECLINED' ? 'DECLINED' : 'CONFIRMED');
  }

  // Verse notes are the member's own, so the companion app uses the same
  // service the staff panel does — only the token differs (Member id, not User).
  @Public()
  @Get('bible-notes')
  async bibleNotes(@Req() req: any) {
    const { member, churchId } = await this.svc.portalUser(bearer(req));
    return this.notes.list(churchId, member.id);
  }

  @Public()
  @Post('bible-notes')
  async createBibleNote(@Req() req: any, @Body() body: { ref?: unknown; text?: unknown; colour?: unknown }) {
    const { member, churchId } = await this.svc.portalUser(bearer(req));
    return this.notes.create(churchId, member.id, body ?? {});
  }

  @Public()
  @Patch('bible-notes/:id')
  async updateBibleNote(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { text?: unknown; colour?: unknown },
  ) {
    const { member, churchId } = await this.svc.portalUser(bearer(req));
    return this.notes.update(churchId, member.id, id, body ?? {});
  }

  @Public()
  @Delete('bible-notes/:id')
  @HttpCode(204)
  async deleteBibleNote(@Req() req: any, @Param('id') id: string) {
    const { member, churchId } = await this.svc.portalUser(bearer(req));
    return this.notes.remove(churchId, member.id, id);
  }
}

@Module({
  imports: [BibleModule],
  providers: [PortalService],
  controllers: [PortalController],
})
export class PortalModule {}
