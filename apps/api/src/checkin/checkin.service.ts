// Member check-in: search by phone/memberNo or scan QR (sha256 token lookup).
// Attendance.id is client-generated for offline replay; (serviceId, memberId)
// unique constraints make double check-in impossible.
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { appendAudit } from '@chms/db';
import { normalizeGhPhone, ageOn, resolveBracket, segmentKeyFor, uuidv7, parseCardScan } from '@chms/shared';
import { TenantService } from '../common/tenant';
import { ServicesService } from '../services/services.service';
import { HeadcountService } from '../headcount/headcount.service';
import { AuthUser } from '../common/guards';

export type CheckInMethod = 'MANUAL' | 'QR' | 'PHONE_LOOKUP';

@Injectable()
export class CheckinService {
  constructor(
    private readonly tenant: TenantService,
    private readonly services: ServicesService,
    private readonly headcount: HeadcountService,
  ) {}

  /**
   * What the door screen opens with: the Sunday to check people into and how
   * many are already in. It reads through ServicesService so the auto-open still
   * runs, and it works with the Services section switched off — the door is not
   * the services screen.
   *
   * The number at the top counts the check-ins themselves, not the section
   * totals: a headcount section the office has switched off still holds people,
   * and a door that under-reports the room is worse than one that says nothing.
   */
  async doorSetup(user: AuthUser) {
    const list = await this.services.list(user);
    const current = list.find((s) => s.status === 'OPEN') ?? list[0] ?? null;
    if (!current) return { currentId: null, services: [], counted: 0, segments: [] };
    const [counted, totals] = await Promise.all([
      this.tenant.run(user, (tx) => tx.attendance.count({ where: { churchId: user.churchId, serviceId: current.id } })),
      this.headcount.totals(user, current.id),
    ]);
    return {
      currentId: current.id,
      services: list.slice(0, 8).map((s) => ({ id: s.id, name: s.name, startsAt: s.startsAt, status: s.status })),
      counted,
      segments: totals.totals,
    };
  }

  /**
   * Find the person standing in front of you. A name, a member number or a phone
   * all work, so the usher never has to ask a member to read their own card.
   */
  find(user: AuthUser, query: string, serviceId?: string) {
    const term = (query ?? '').trim();
    if (term.length < 2) return Promise.resolve([]);
    let phone: string | null = null;
    try {
      phone = normalizeGhPhone(term);
    } catch {
      phone = null;
    }
    const words = term.split(/\s+/);
    // Every word has to match a first or a last name, so "Kofi Mensah" and
    // "Mensah Kofi" both find him but "Kofi Boateng" does not.
    const nameMatch = words.map((w) => ({
      OR: [
        { firstName: { contains: w, mode: 'insensitive' as const } },
        { lastName: { contains: w, mode: 'insensitive' as const } },
      ],
    }));
    return this.tenant.run(user, async (tx) => {
      const members = await tx.member.findMany({
        where: {
          churchId: user.churchId,
          deletedAt: null,
          status: 'ACTIVE',
          OR: [{ AND: nameMatch }, { memberNo: { contains: term, mode: 'insensitive' } }, ...(phone ? [{ phoneE164: phone }] : [])],
        },
        select: { id: true, firstName: true, lastName: true, memberNo: true, phoneE164: true },
        orderBy: { firstName: 'asc' },
        take: 20,
      });
      if (!serviceId || !members.length) return members.map((m) => ({ ...m, checkedIn: false }));
      const inside = await tx.attendance.findMany({
        where: { churchId: user.churchId, serviceId, memberId: { in: members.map((m) => m.id) } },
        select: { memberId: true },
      });
      const done = new Set(inside.map((a) => a.memberId));
      return members.map((m) => ({ ...m, checkedIn: done.has(m.id) }));
    });
  }

  async checkIn(
    user: AuthUser,
    input: { serviceId: string; memberId?: string; qrToken?: string; code?: string; phoneE164?: string; method?: CheckInMethod },
    ip?: string,
  ) {
    const method = input.method ?? (input.qrToken ? 'QR' : input.phoneE164 ? 'PHONE_LOOKUP' : 'MANUAL');
    return this.tenant.run(user, async (tx) => {
      const service = await tx.service.findFirst({
        where: { id: input.serviceId, churchId: user.churchId },
      });
      if (!service) throw new NotFoundException('service not found');
      if (service.status === 'CLOSED') throw new BadRequestException('service is closed');

      let memberId = input.memberId ?? null;
      // One door input: a scanned card (hashed QR token) or the typed member
      // number/phone. The same box takes either, so nobody has to choose.
      const typed = (input.code ?? input.qrToken ?? '').trim();
      if (!memberId && typed) {
        // A card says which church printed it. Member numbers only repeat across
        // churches, so a foreign card has to be refused by name — never matched
        // against whoever holds that number here.
        const scan = parseCardScan(typed);
        const code = scan ? scan.ref : typed;
        if (scan) {
          const here = await tx.church.findUnique({ where: { id: user.churchId }, select: { slug: true } });
          if (here && scan.slug !== here.slug.toLowerCase()) {
            throw new BadRequestException(`That card belongs to another church (${scan.slug}) — it cannot be used here.`);
          }
        }
        const hash = createHash('sha256').update(code).digest('hex');
        // A member number is not a phone number; only try the phone lookup when
        // the text actually parses, otherwise the member-number check never runs.
        let phone: string | null = null;
        try {
          phone = normalizeGhPhone(code);
        } catch {
          phone = null;
        }
        const member = await tx.member.findFirst({
          where: {
            churchId: user.churchId,
            deletedAt: null,
            status: 'ACTIVE',
            OR: [
              { qrToken: hash },
              { memberNo: { equals: code, mode: 'insensitive' } },
              ...(phone ? [{ phoneE164: phone }] : []),
            ],
          },
          select: { id: true },
        });
        if (!member) throw new NotFoundException('no member matches that card or code');
        memberId = member.id;
      }
      if (!memberId && input.phoneE164) {
        const phone = normalizeGhPhone(input.phoneE164);
        const member = await tx.member.findFirst({
          where: { churchId: user.churchId, phoneE164: phone, deletedAt: null, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!member) throw new NotFoundException('no active member with that phone');
        memberId = member.id;
      }
      if (!memberId) throw new BadRequestException('provide memberId, qrToken, or phoneE164');

      // Idempotent: replays (offline outbox) hit the unique constraint.
      const existing = await tx.attendance.findUnique({
        where: { serviceId_memberId: { serviceId: input.serviceId, memberId } },
      });
      if (existing) return { alreadyCheckedIn: true, attendance: existing, section: null };

      const attendance = await tx.attendance.create({
        data: {
          id: uuidv7(),
          churchId: user.churchId,
          serviceId: input.serviceId,
          memberId,
          checkedInAt: new Date(),
          method,
          deviceId: null,
        },
      });

      // Auto-sort: increment the member's age-bracket headcount section
      // (respecting the demographics.autoAssignHeadcount toggle).
      let section: string | null = null;
      const churchRow = await tx.church.findUnique({ where: { id: user.churchId } });
      const demo = (churchRow?.settings as any)?.demographics ?? {};
      if (demo.autoAssignHeadcount !== false) {
        const m = await tx.member.findFirst({
          where: { id: memberId },
          select: { ageBracketId: true, dob: true, gender: true },
        });
        let bracketId = m?.ageBracketId ?? null;
        if (!bracketId && m?.dob) {
          const brackets = await tx.ageBracket.findMany({ where: { churchId: user.churchId, isActive: true } });
          const age = ageOn(m.dob);
          bracketId = resolveBracket(age, brackets)?.id ?? null;
        }
        if (bracketId) {
          const bracket = await tx.ageBracket.findUnique({ where: { id: bracketId } });
          if (bracket) {
            const segKey = segmentKeyFor(
              {
                id: bracket.id,
                key: bracket.key,
                label: bracket.label,
                minAge: bracket.minAge,
                maxAge: bracket.maxAge,
                genderSplit: bracket.genderSplit,
                segmentKey: bracket.segmentKey,
              },
              m?.gender ?? null,
            );
            const segment = await tx.headcountSegment.findUnique({
              where: { churchId_key: { churchId: user.churchId, key: segKey } },
            });
            if (segment) {
              await tx.headcount.create({
                data: {
                  id: uuidv7(),
                  churchId: user.churchId,
                  serviceId: input.serviceId,
                  segmentId: segment.id,
                  delta: 1,
                  deviceId: 'auto-checkin',
                  clientSeq: 0,
                  recordedBy: user.userId,
                  recordedAt: new Date(),
                },
              });
              section = segment.label;
            }
          }
        }
      }

      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: 'checkin',
        entity: 'Attendance',
        entityId: attendance.id,
        after: { serviceId: input.serviceId, memberId, method, section },
        ip,
      });
      return { alreadyCheckedIn: false, attendance, section };
    });
  }

  list(user: AuthUser, serviceId: string) {
    return this.tenant.run(user, (tx) =>
      tx.attendance.findMany({
        where: { churchId: user.churchId, serviceId },
        include: { member: { select: { id: true, firstName: true, lastName: true, memberNo: true } } },
        orderBy: { checkedInAt: 'desc' },
        take: 500,
      }),
    );
  }
}
