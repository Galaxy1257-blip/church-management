// Public endpoints (no auth): visitor registration landing form (rate
// limited per-IP in-memory), church lookup. Turnstile hook is env-gated.
import { Body, Controller, Get, HttpCode, Module, Param, Post, Req } from '@nestjs/common';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { prisma, withTenant } from '@chms/db';
import { normalizeGhPhone } from '@chms/shared';
import { Public } from '../common/decorators';
import { resolveMemberBracket } from '../members/members.service';

const hits = new Map<string, { count: number; at: number }>();
function rateLimit(ip: string, max = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.at > windowMs) {
    hits.set(ip, { count: 1, at: now });
    return true;
  }
  h.count += 1;
  return h.count <= max;
}

class PublicVisitorDto {
  @IsString() @MinLength(1) firstName!: string;
  @IsOptional() @IsString() lastName?: string;
  @IsString() phoneE164!: string;
  @IsOptional() @IsString() dob?: string;
  @IsOptional() @IsString() notes?: string;
}

@Controller('public')
export class PublicController {
  @Public()
  @Get(':slug')
  async church(@Param('slug') slug: string) {
    // case-insensitive church id; returns branding (logo/name/tagline) for the sign-in page
    const c = await prisma.church.findUnique({
      where: { slug: slug.trim().toLowerCase() },
      select: { id: true, name: true, slug: true, pastorDisplayName: true, settings: true },
    });
    if (!c) return null;
    const branding = ((c.settings ?? {}) as { branding?: unknown }).branding ?? null;
    return { ...c, id: undefined, settings: undefined, branding };
  }

  /** Offline-friendly guest slip: idempotent by (church, phone). */
  @Public()
  @Post(':slug/visitors')
  @HttpCode(200)
  async registerVisitor(@Param('slug') slug: string, @Body() dto: PublicVisitorDto & { turnstileToken?: string }, @Req() req: any) {
    if (!rateLimit(req.ip ?? 'unknown')) return { ok: false, error: 'too many requests' };
    // Cloudflare Turnstile: enforced when TURNSTILE_SECRET_KEY is configured.
    const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
    if (turnstileSecret) {
      if (!dto.turnstileToken) return { ok: false, error: 'turnstile challenge required' };
      const verify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: turnstileSecret, response: dto.turnstileToken, remoteip: req.ip }),
      });
      const result = (await verify.json()) as { success?: boolean };
      if (!result.success) return { ok: false, error: 'turnstile failed' };
    }
    const church = await prisma.church.findUnique({ where: { slug: slug.trim().toLowerCase() } });
    if (!church) return { ok: false, error: 'unknown church' };
    const phone = normalizeGhPhone(dto.phoneE164);
    return withTenant(church.id, null, async (tx) => {
      const existing = await tx.visitor.findUnique({
        where: { churchId_phoneE164: { churchId: church.id, phoneE164: phone } },
      });
      if (existing) {
        const updated = await tx.visitor.update({
          where: { id: existing.id },
          data: { visitCount: { increment: 1 }, status: existing.status === 'OPTED_OUT' ? 'OPTED_OUT' : 'RETURNED' },
        });
        return { ok: true, isNew: false, visits: updated.visitCount };
      }
      const { ageBracketId } = await resolveMemberBracket(tx, church.id, { dob: dto.dob ?? null });
      const v = await tx.visitor.create({
        data: {
          churchId: church.id,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName?.trim() || null,
          phoneE164: phone,
          ageBracketId,
          notes: dto.notes ?? null,
          status: 'NEW',
        },
      });
      const workflow = await tx.followUpWorkflow.findFirst({
        where: { churchId: church.id, trigger: 'VISITOR_REGISTERED', isActive: true },
      });
      if (workflow) {
        const version = await tx.followUpWorkflowVersion.findFirst({
          where: { workflowId: workflow.id, isPublished: true },
          orderBy: { version: 'desc' },
        });
        if (version) {
          const firstStep = await tx.followUpStep.findFirst({ where: { versionId: version.id }, orderBy: { position: 'asc' } });
          await tx.followUpProgress.create({
            data: {
              churchId: church.id,
              workflowId: workflow.id,
              versionId: version.id,
              visitorId: v.id,
              state: 'ACTIVE',
              nextPosition: 0,
              nextRunAt: firstStep ? new Date(Date.now() + firstStep.delayMinutes * 60_000) : null,
            },
          });
        }
      }
      return { ok: true, isNew: true, visits: 1 };
    });
  }
}

@Module({
  controllers: [PublicController],
})
export class PublicModule {}
