// Member self-service portal: OTP login bound to a Member record (no staff
// account needed), my-giving history, giving statement (JSON/print-ready).
import { Body, Controller, Get, HttpCode, Injectable, Module, Param, Post, Query, Req, UnauthorizedException } from '@nestjs/common';
import { createHash, randomInt } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { prisma, withTenant } from '@chms/db';
import { normalizeGhPhone, uuidv7, localizedSmsBody } from '@chms/shared';
import { Public } from '../common/decorators';

const OTP_TTL = 10 * 60_000;

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

  async statement(token: string, year: number) {
    const rows = await this.myGiving(token);
    const filtered = rows.filter((r) => (r.date ? new Date(r.date).getUTCFullYear() === year : false));
    return { year, rows: filtered, totalMinor: filtered.reduce((a, r) => a + r.amountMinor, 0) };
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
        where: { churchId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        orderBy: { publishAt: 'desc' },
        take: 5,
        select: { id: true, title: true, body: true, publishAt: true },
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

  async prayer(token: string, body: string, anonymous: boolean) {
    const { member, churchId } = await this.portalUser(token);
    if (!body || body.trim().length < 3) throw new Error('prayer request too short');
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
        },
      }),
    );
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


function bearer(req: any): string {
  return String(req.headers.authorization ?? '').replace(/^Bearer /, '');
}

@Controller('portal')
export class PortalController {
  constructor(private readonly svc: PortalService) {}

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
  prayer(@Req() req: any, @Body() body: { body: string; anonymous?: boolean }) {
    return this.svc.prayer(bearer(req), String(body?.body ?? ''), body?.anonymous === true);
  }

  @Public()
  @Post('shifts/:id/respond')
  @HttpCode(200)
  respondShift(@Req() req: any, @Param('id') id: string, @Body() body: { status: 'CONFIRMED' | 'DECLINED' }) {
    return this.svc.respondShift(bearer(req), id, body?.status === 'DECLINED' ? 'DECLINED' : 'CONFIRMED');
  }
}

@Module({
  providers: [PortalService],
  controllers: [PortalController],
})
export class PortalModule {}
