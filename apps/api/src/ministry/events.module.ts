// Events + RSVP (members and guests, party size, waitlist when at capacity).
import { Body, Controller, Get, Injectable, Module, Param, Post, Req } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { appendAudit } from '@chms/db';
import { uuidv7 } from '@chms/shared';
import { RequirePermissions } from '../common/decorators';
import { AuthedRequest, AuthUser } from '../common/guards';
import { TenantService } from '../common/tenant';

class EventDto {
  @IsString() @MinLength(1) title!: string;
  @IsOptional() @IsString() description?: string;
  @IsString() startsAt!: string;
  @IsOptional() @IsString() endsAt?: string;
  @IsOptional() @IsString() venue?: string;
  @IsOptional() @IsInt() @Min(1) capacity?: number;
  @IsOptional() @IsInt() @Min(0) feeMinor?: number;
}
class RsvpDto {
  @IsOptional() @IsString() memberId?: string;
  @IsOptional() @IsString() guestName?: string;
  @IsOptional() @IsString() guestPhoneE164?: string;
  @IsOptional() @IsInt() @Min(1) partySize?: number;
}

@Injectable()
export class EventsService {
  constructor(private readonly tenant: TenantService) {}

  list(user: AuthUser) {
    return this.tenant.run(user, (tx) =>
      tx.event.findMany({ where: { churchId: user.churchId }, orderBy: { startsAt: 'desc' }, take: 100 }),
    );
  }

  create(user: AuthUser, input: EventDto, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const e = await tx.event.create({
        data: {
          churchId: user.churchId,
          title: input.title,
          description: input.description ?? null,
          startsAt: new Date(input.startsAt),
          endsAt: input.endsAt ? new Date(input.endsAt) : null,
          venue: input.venue ?? null,
          capacity: input.capacity ?? null,
          feeMinor: input.feeMinor ?? 0,
        },
      });
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: 'event.create', entity: 'Event', entityId: e.id, after: e, ip });
      return e;
    });
  }

  rsvp(user: AuthUser, eventId: string, input: RsvpDto, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const event = await tx.event.findFirst({ where: { id: eventId, churchId: user.churchId } });
      if (!event) throw new Error('event not found');
      let status: 'GOING' | 'WAITLIST' = 'GOING';
      if (event.capacity) {
        const going = await tx.eventRsvp.aggregate({
          where: { eventId, status: { in: ['GOING', 'WAITLIST'] } },
          _sum: { partySize: true },
        });
        if ((going._sum.partySize ?? 0) + (input.partySize ?? 1) > event.capacity) status = 'WAITLIST';
      }
      const r = await tx.eventRsvp.create({
        data: {
          id: uuidv7(),
          churchId: user.churchId,
          eventId,
          memberId: input.memberId ?? null,
          guestName: input.guestName ?? null,
          guestPhoneE164: input.guestPhoneE164 ?? null,
          partySize: input.partySize ?? 1,
          status,
          qrToken: uuidv7(),
        },
      });
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: 'event.rsvp', entity: 'EventRsvp', entityId: r.id, after: { eventId, status }, ip });
      return { id: r.id, status, qrToken: r.qrToken };
    });
  }

  rsvps(user: AuthUser, eventId: string) {
    return this.tenant.run(user, (tx) =>
      tx.eventRsvp.findMany({ where: { churchId: user.churchId, eventId }, take: 500 }),
    );
  }
}

@Controller('events')
export class EventsController {
  constructor(private readonly svc: EventsService) {}

  @RequirePermissions('services:read')
  @Get()
  list(@Req() req: AuthedRequest) {
    return this.svc.list(req.user!);
  }

  @RequirePermissions('services:write')
  @Post()
  create(@Req() req: AuthedRequest, @Body() dto: EventDto) {
    return this.svc.create(req.user!, dto, req.ip);
  }

  @RequirePermissions('services:read')
  @Post(':id/rsvp')
  rsvp(@Req() req: AuthedRequest, @Param('id') id: string, @Body() dto: RsvpDto) {
    return this.svc.rsvp(req.user!, id, dto, req.ip);
  }

  @RequirePermissions('services:read')
  @Get(':id/rsvps')
  rsvps(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.svc.rsvps(req.user!, id);
  }
}

@Module({
  providers: [TenantService, EventsService],
  controllers: [EventsController],
})
export class EventsModule {}
