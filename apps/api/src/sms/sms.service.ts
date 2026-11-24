// SMS admin: wallet, packages/purchase, bulk campaigns (audience filter,
// segment counter, cost preview), opt-out management, logs. Single sends go
// through the SmsDispatcher; a campaign fans out in bulk with the same
// SmsLog rows and reservation rules, then the worker drains the queue.
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { appendAudit, Db, prisma, Prisma } from '@chms/db';
import {
  formatGhs,
  MemberStatus,
  resolveSmsQuietHours,
  smsQuietHoursBlocked,
  smsSegments,
} from '@chms/shared';
import { TenantService } from '../common/tenant';
import { AuthUser } from '../common/guards';
import { QueuesService } from '../queues/queues.module';
import { SmsDispatcher } from './sms-dispatcher';

export interface CampaignAudience {
  bracketIds?: string[];
  memberStatus?: MemberStatus[];
  branchIds?: string[];
  includeVisitors?: boolean;
  visitFrom?: string;
  visitTo?: string;
}

export interface ResolvedRecipient {
  phoneE164: string;
  memberId: string | null;
  visitorId: string | null;
}

@Injectable()
export class SmsService {
  constructor(
    private readonly tenant: TenantService,
    private readonly dispatcher: SmsDispatcher,
    private readonly queues: QueuesService,
  ) {}

  wallet(user: AuthUser) {
    return this.tenant.run(user, async (tx) => {
      const w = await tx.smsWallet.findUnique({ where: { churchId: user.churchId } });
      return w ?? { churchId: user.churchId, balanceUnits: 0, reservedUnits: 0 };
    });
  }

  packages() {
    // Global price list — not tenant data; read with the platform client.
    return prisma.smsPackage.findMany({ where: { isActive: true }, orderBy: { priceMinor: 'asc' } });
  }

  ledger(user: AuthUser, limit = 50) {
    return this.tenant.run(user, (tx) =>
      tx.smsLedger.findMany({
        where: { churchId: user.churchId },
        orderBy: { createdAt: 'desc' },
        take: Math.min(200, limit),
      }),
    );
  }

  logs(user: AuthUser, limit = 50) {
    return this.tenant.run(user, (tx) =>
      tx.smsLog.findMany({
        where: { churchId: user.churchId },
        orderBy: { queuedAt: 'desc' },
        take: Math.min(200, limit),
      }),
    );
  }

  optOuts(user: AuthUser) {
    return this.tenant.run(user, (tx) =>
      tx.smsOptOut.findMany({ where: { churchId: user.churchId }, orderBy: { createdAt: 'desc' }, take: 500 }),
    );
  }

  async removeOptOut(user: AuthUser, phoneE164: string, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      await tx.smsOptOut.deleteMany({ where: { churchId: user.churchId, phoneE164 } });
      await tx.optEvent.create({
        data: { churchId: user.churchId, phoneE164, type: 'OPT_IN', keyword: 'MANUAL', actorId: user.userId },
      });
      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: 'sms.optout.remove',
        entity: 'SmsOptOut',
        entityId: phoneE164,
        ip,
      });
      return { removed: true };
    });
  }

  /** Resolve campaign recipients: members with consent + opted-in visitors. */
  private async resolveAudience(
    tx: Db,
    churchId: string,
    audience: CampaignAudience,
  ): Promise<ResolvedRecipient[]> {
    const optedOut = new Set(
      (await tx.smsOptOut.findMany({ where: { churchId }, select: { phoneE164: true } })).map((o) => o.phoneE164),
    );
    const out: ResolvedRecipient[] = [];
    const seen = new Set<string>();

    const members = await tx.member.findMany({
      where: {
        churchId,
        deletedAt: null,
        status: audience.memberStatus?.length ? { in: audience.memberStatus } : 'ACTIVE',
        ...(audience.bracketIds?.length ? { ageBracketId: { in: audience.bracketIds } } : {}),
        ...(audience.branchIds?.length ? { branchId: { in: audience.branchIds } } : {}),
        phoneE164: { not: null },
        smsConsent: true,
      },
      select: { id: true, phoneE164: true },
    });
    for (const m of members) {
      if (!m.phoneE164 || optedOut.has(m.phoneE164) || seen.has(m.phoneE164)) continue;
      seen.add(m.phoneE164);
      out.push({ phoneE164: m.phoneE164, memberId: m.id, visitorId: null });
    }

    if (audience.includeVisitors) {
      const visitors = await tx.visitor.findMany({
        where: {
          churchId,
          consentSms: true,
          ...(audience.visitFrom || audience.visitTo
            ? {
                createdAt: {
                  ...(audience.visitFrom ? { gte: new Date(audience.visitFrom) } : {}),
                  ...(audience.visitTo ? { lte: new Date(audience.visitTo) } : {}),
                },
              }
            : {}),
        },
        select: { id: true, phoneE164: true },
      });
      for (const v of visitors) {
        if (optedOut.has(v.phoneE164) || seen.has(v.phoneE164)) continue;
        seen.add(v.phoneE164);
        out.push({ phoneE164: v.phoneE164, memberId: null, visitorId: v.id });
      }
    }
    return out;
  }

  async previewCampaign(
    user: AuthUser,
    input: { body: string; audience: CampaignAudience },
  ): Promise<{ recipients: number; segments: number; totalUnits: number; costLabel: string }> {
    return this.tenant.run(user, async (tx) => {
      const recipients = await this.resolveAudience(tx, user.churchId, input.audience ?? {});
      const segments = smsSegments(input.body);
      const totalUnits = recipients.length * segments;
      return {
        recipients: recipients.length,
        segments,
        totalUnits,
        costLabel: `${totalUnits} SMS unit(s) ≈ ${formatGhs(0)} (buy credits via packages)`,
      };
    });
  }

  createCampaign(
    user: AuthUser,
    input: { name: string; body: string; audience: CampaignAudience; scheduledAt?: string },
    ip?: string,
  ) {
    if (!input.body?.trim()) throw new BadRequestException('body is required');
    if (smsSegments(input.body) > 10) throw new BadRequestException('body too long (max 10 segments)');
    return this.tenant.run(user, async (tx) => {
      const campaign = await tx.smsCampaign.create({
        data: {
          churchId: user.churchId,
          name: input.name.trim(),
          body: input.body,
          audience: (input.audience ?? {}) as any,
          status: input.scheduledAt ? 'SCHEDULED' : 'DRAFT',
          scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
          createdBy: user.userId,
        },
      });
      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: 'sms.campaign.create',
        entity: 'SmsCampaign',
        entityId: campaign.id,
        after: { name: campaign.name },
        ip,
      });
      return campaign;
    });
  }

  campaigns(user: AuthUser) {
    return this.tenant.run(user, (tx) =>
      tx.smsCampaign.findMany({
        where: { churchId: user.churchId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    );
  }

  /** Recipients per fan-out chunk: one wallet update + one INSERT per chunk. */
  private static readonly CAMPAIGN_CHUNK = 500;

  /**
   * Materialise one SmsLog per recipient (idempotency key campaign:{id}:{phone})
   * and enqueue. Wallet reservation is bulk per chunk, and a short wallet
   * suppresses the tail rather than failing the whole campaign.
   */
  async sendCampaign(user: AuthUser, campaignId: string, ip?: string) {
    const logIds = await this.tenant.run(user, async (tx) => {
      const campaign = await tx.smsCampaign.findFirst({
        where: { id: campaignId, churchId: user.churchId },
      });
      if (!campaign) throw new NotFoundException('campaign not found');
      if (campaign.status === 'SENDING' || campaign.status === 'DONE') {
        throw new BadRequestException('campaign already sent');
      }
      // Refuse honestly during quiet hours instead of queueing zero recipients
      // and calling it sent. Transactional sends never reach this guard.
      const church = await tx.church.findUnique({
        where: { id: user.churchId },
        select: { settings: true, timezone: true },
      });
      if (church && smsQuietHoursBlocked(church.settings, church.timezone)) {
        const q = resolveSmsQuietHours(church.settings);
        const start = String(q.start).padStart(2, '0');
        const end = String(q.end).padStart(2, '0');
        throw new BadRequestException(
          `It is quiet hours in your church (${start}:00–${end}:00) — this message would not be delivered now. ` +
            'Schedule it for the morning, or change quiet hours in Settings → SMS.',
        );
      }
      const audience = (campaign.audience ?? {}) as CampaignAudience;
      const recipients = await this.resolveAudience(tx, user.churchId, audience);
      if (recipients.length === 0) throw new BadRequestException('audience resolved to zero recipients');

      const segments = smsSegments(campaign.body);

      // Claim the campaign row before materialising anything: two staff tapping
      // "send" cannot fan out twice, and a rollback releases the claim.
      const claim = await tx.smsCampaign.updateMany({
        where: { id: campaignId, churchId: user.churchId, status: { in: ['DRAFT', 'SCHEDULED'] } },
        data: { status: 'SENDING', totalRecipients: recipients.length },
      });
      if (claim.count === 0) throw new BadRequestException('campaign already sent');

      const logIds: string[] = [];

      // Bulk path: ~5 statements per 500 recipients, not ~8 per recipient.
      for (let i = 0; i < recipients.length; i += SmsService.CAMPAIGN_CHUNK) {
        const chunk = recipients.slice(i, i + SmsService.CAMPAIGN_CHUNK);
        const already = await tx.smsLog.findMany({
          where: { campaignId, toE164: { in: chunk.map((r) => r.phoneE164) } },
          select: { toE164: true },
        });
        const seen = new Set(already.map((r) => r.toE164));
        let fresh = chunk.filter((r) => !seen.has(r.phoneE164));
        if (fresh.length === 0) continue;

        let units = fresh.length * segments;
        let reserved = await tx.smsWallet.updateMany({
          where: { churchId: user.churchId, balanceUnits: { gte: units } },
          data: { balanceUnits: { decrement: units }, reservedUnits: { increment: units } },
        });
        if (reserved.count === 0) {
          // Wallet cannot fund the whole chunk: send exactly what it can.
          const w = await tx.smsWallet.findUnique({ where: { churchId: user.churchId } });
          const affordable = Math.min(fresh.length, Math.floor((w?.balanceUnits ?? 0) / segments));
          if (affordable === 0) break;
          fresh = fresh.slice(0, affordable);
          units = fresh.length * segments;
          reserved = await tx.smsWallet.updateMany({
            where: { churchId: user.churchId, balanceUnits: { gte: units } },
            data: { balanceUnits: { decrement: units }, reservedUnits: { increment: units } },
          });
          if (reserved.count === 0) break;
        }

        const logRows: Prisma.SmsLogCreateManyInput[] = fresh.map((r) => ({
          churchId: user.churchId,
          channel: 'SMS',
          source: 'CAMPAIGN',
          campaignId,
          toE164: r.phoneE164,
          body: campaign.body,
          segments,
          status: 'QUEUED',
          idempotencyKey: `campaign:${campaignId}:${r.phoneE164}`,
        }));
        await tx.smsLog.createMany({ data: logRows, skipDuplicates: true });

        const inserted = await tx.smsLog.findMany({
          where: { campaignId, toE164: { in: fresh.map((r) => r.phoneE164) } },
          select: { id: true, toE164: true },
        });
        const idByPhone = new Map(inserted.map((r) => [r.toE164, r.id]));

        const walletAfterReservation = await tx.smsWallet.findUnique({ where: { churchId: user.churchId } });
        if (!walletAfterReservation) throw new Error('SMS wallet disappeared during reservation.');
        let balanceAfter = walletAfterReservation.balanceUnits + inserted.length * segments;
        const ledgerRows: Prisma.SmsLedgerCreateManyInput[] = [];
        for (const r of fresh) {
          const logId = idByPhone.get(r.phoneE164);
          if (!logId) continue;
          balanceAfter -= segments;
          ledgerRows.push({
            churchId: user.churchId,
            delta: -segments,
            reason: 'RESERVE',
            refType: 'SMS_LOG',
            refId: logId,
            balanceAfter,
            idempotencyKey: `reserve:campaign:${campaignId}:${r.phoneE164}`,
          });
          logIds.push(logId);
        }
        await tx.smsLedger.createMany({ data: ledgerRows, skipDuplicates: true });
      }

      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: 'sms.campaign.send',
        entity: 'SmsCampaign',
        entityId: campaignId,
        after: { recipients: recipients.length, segments, queued: logIds.length },
        ip,
      });
      return logIds;
    });
    // One Redis round trip per 1,000 logs instead of one per recipient.
    this.queues.enqueueCampaignSendBulk(logIds);
    return { queued: logIds.length };
  }
}
