// Reminders: a leader types one message and the whole church sees it in the
// companion's notification pane — now, or 1 week / 3 days / 1 day before a
// program. Two leaders cannot send the same message twice: the text is hashed
// into a per-church unique key and the second sender is told who was first.
import { Body, ConflictException, Controller, Get, Injectable, Module, Post, Req } from '@nestjs/common';
import { appendAudit } from '@chms/db';
import { createHash } from 'node:crypto';
import { ForModule, RequirePermissions } from '../common/decorators';
import { AuthedRequest, AuthUser } from '../common/guards';
import { TenantService } from '../common/tenant';

const DAY = 86_400_000;
export const REMIND_OFFSETS = [{ days: 7, label: '1 week before' }, { days: 3, label: '3 days before' }, { days: 1, label: '1 day before' }];

/** Same words, same key — case, spacing and punctuation do not matter. */
export function reminderKey(title: string, body: string): string {
  return createHash('sha256').update(`${title} ${body}`.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()).digest('hex').slice(0, 24);
}

/**
 * The rows one broadcast creates. With a program date and offsets, one row per
 * offset (all pointing at the same announcement); otherwise a single row now.
 */
export function reminderRows(input: {
  title: string;
  body: string;
  programAt?: Date | null;
  offsets?: number[];
  now?: Date;
  sourceId?: string | null;
  kind?: string;
}) {
  const now = input.now ?? new Date();
  const key = reminderKey(input.title, input.body);
  const kind = input.kind ?? 'REMINDER';
  if (!input.programAt || !input.offsets?.length) {
    return [{ title: input.title, body: input.body, kind, scheduledFor: now, dedupeKey: `${key}:now`, sourceId: input.sourceId ?? null }];
  }
  return [...new Set(input.offsets)]
    .sort((a, b) => b - a)
    .map((days) => ({
      title: input.title,
      body: input.body,
      kind,
      scheduledFor: new Date(input.programAt!.getTime() - days * DAY),
      dedupeKey: `${key}:${days}d`,
      sourceId: input.sourceId ?? null,
    }));
}

@Injectable()
export class RemindersService {
  constructor(private readonly tenant: TenantService) {}

  /** Broadcast now or schedule it; refuses a message another leader already sent. */
  async send(user: AuthUser, input: { title: string; body: string; programAt?: string | null; offsets?: number[] }) {
    const title = input.title.trim();
    const body = input.body.trim();
    if (title.length < 3 || body.length < 3) throw new ConflictException('Write a title and the message first.');
    const rows = reminderRows({
      title,
      body,
      programAt: input.programAt ? new Date(input.programAt) : null,
      offsets: (input.offsets ?? []).filter((d) => REMIND_OFFSETS.some((o) => o.days === d)),
    });
    return this.tenant.run(user, async (tx) => {
      // The hash covers the same text regardless of who types it, so a second
      // leader hits this before anything is created.
      const existing = await tx.notification.findFirst({
        where: { churchId: user.churchId, dedupeKey: { startsWith: reminderKey(title, body) } },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) {
        const when = existing.scheduledFor > new Date() ? 'is already scheduled' : 'was already sent';
        throw new ConflictException(
          `This exact message ${when} (${existing.scheduledFor.toLocaleDateString('en-GB')}). Schedule it for another day or change the wording.`,
        );
      }
      const created = await tx.notification.createMany({
        data: rows.map((r) => ({ ...r, churchId: user.churchId, createdBy: user.userId })),
      });
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: 'reminder.send', entity: 'Notification', entityId: rows[0].dedupeKey, ip: undefined });
      return { created: created.count, scheduledFor: rows.map((r) => r.scheduledFor) };
    });
  }

  list(user: AuthUser) {
    return this.tenant.run(user, (tx) =>
      tx.notification.findMany({ where: { churchId: user.churchId }, orderBy: { scheduledFor: 'desc' }, take: 50 }),
    );
  }
}

@ForModule('reach')
@Controller('reminders')
export class RemindersController {
  constructor(private readonly svc: RemindersService) {}

  @RequirePermissions('campaigns:read')
  @Get()
  list(@Req() req: AuthedRequest) {
    return this.svc.list(req.user!);
  }

  @RequirePermissions('campaigns:write')
  @Post()
  send(
    @Req() req: AuthedRequest,
    @Body() body: { title?: string; body?: string; programAt?: string | null; offsets?: number[] },
  ) {
    return this.svc.send(req.user!, { title: String(body?.title ?? ''), body: String(body?.body ?? ''), programAt: body?.programAt ?? null, offsets: body?.offsets ?? [] });
  }
}

@Module({ providers: [TenantService, RemindersService], controllers: [RemindersController] })
export class RemindersModule {}
