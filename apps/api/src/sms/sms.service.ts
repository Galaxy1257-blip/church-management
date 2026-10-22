// SMS admin: wallet, packages/purchase, bulk campaigns (audience filter,
// segment counter, cost preview), opt-out management, logs. Actual sending
// goes through the SmsDispatcher (single path) — campaigns materialise
// SmsLog rows idempotently, then the worker drains the queue.
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { appendAudit, Db, prisma } from '@chms/db';
import {
  formatGhs,
  MemberStatus,
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

  /**
   * Materialise one SmsLog per recipient (idempotency key campaign:{id}:{phone})
   * and enqueue. Wallet reservation happens per-log in the dispatcher, so a
   * short wallet suppresses the tail rather than failing the whole campaign.
   */
  async sendCampaign(user: AuthUser, campaignId: string, ip?: string) {
    const { logIds } = await this.tenant.run(user, async (tx) => {
      const campaign = await tx.smsCampaign.findFirst({
        where: { id: campaignId, churchId: user.churchId },
      });
      if (!campaign) throw new NotFoundException('campaign not found');
      if (campaign.status === 'SENDING' || campaign.status === 'DONE') {
        throw new BadRequestException('campaign already sent');
      }
      const audience = (campaign.audience ?? {}) as CampaignAudience;
      const recipients = await this.resolveAudience(tx, user.churchId, audience);
      if (recipients.length === 0) throw new BadRequestException('audience resolved to zero recipients');

      const segments = smsSegments(campaign.body);
      const logIds: string[] = [];
      for (const r of recipients) {
        const outcome = await this.dispatcher.dispatch(tx, {
          churchId: user.churchId,
          toE164: r.phoneE164,
          body: campaign.body,
          source: 'CAMPAIGN',
          idempotencyKey: `campaign:${campaignId}:${r.phoneE164}`,
          campaignId,
        });
        if (outcome.status === 'QUEUED') logIds.push(outcome.logId);
      }

      await tx.smsCampaign.update({
        where: { id: campaignId },
        data: { status: 'SENDING', totalRecipients: recipients.length },
      });
      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: 'sms.campaign.send',
        entity: 'SmsCampaign',
        entityId: campaignId,
        after: { recipients: recipients.length, segments, queued: logIds.length },
        ip,
      });
      return { logIds };
    });
    for (const id of logIds) this.queues.enqueueCampaignSend(id);
    return { queued: logIds.length };
  }
}
