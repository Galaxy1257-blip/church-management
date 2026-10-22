// Member check-in: search by phone/memberNo or scan QR (sha256 token lookup).
// Attendance.id is client-generated for offline replay; (serviceId, memberId)
// unique constraints make double check-in impossible.
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { appendAudit } from '@chms/db';
import { normalizeGhPhone, ageOn, resolveBracket, segmentKeyFor, uuidv7 } from '@chms/shared';
import { TenantService } from '../common/tenant';
import { AuthUser } from '../common/guards';

export type CheckInMethod = 'MANUAL' | 'QR' | 'PHONE_LOOKUP';

@Injectable()
export class CheckinService {
  constructor(private readonly tenant: TenantService) {}

  async checkIn(
    user: AuthUser,
    input: { serviceId: string; memberId?: string; qrToken?: string; phoneE164?: string; method?: CheckInMethod },
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
      if (!memberId && input.qrToken) {
        const hash = createHash('sha256').update(input.qrToken.trim()).digest('hex');
        const member = await tx.member.findFirst({
          where: { churchId: user.churchId, qrToken: hash, deletedAt: null },
          select: { id: true },
        });
        if (!member) throw new NotFoundException('no member matches that QR token');
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
