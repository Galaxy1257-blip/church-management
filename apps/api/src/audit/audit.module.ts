import { Controller, Get, Module, Query, Req } from '@nestjs/common';
import { ForModule, RequirePermissions } from '../common/decorators';
import { AuthedRequest } from '../common/guards';
import { TenantService } from '../common/tenant';
import { AuditListOptions, AuditService } from './audit.service';

/**
 * The activity log. Read-only by construction: this controller exposes no write
 * route, and the database itself blocks UPDATE, DELETE and TRUNCATE on
 * `audit_event` — the screen can show the history, it cannot change it.
 *
 * Two doors, not one: `audit:read` decides who is allowed, and the Activity log
 * section switch decides whether this church uses the page at all. Switching it
 * off hides the page; it never stops the recording, because every module writes
 * its own rows as it works.
 */
@ForModule('audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @RequirePermissions('audit:read')
  @Get('events')
  events(@Req() req: AuthedRequest, @Query() query: AuditListOptions) {
    return this.audit.list(req.user!, query);
  }

  @RequirePermissions('audit:read')
  @Get('groups')
  groups(@Req() req: AuthedRequest) {
    return this.audit.groups(req.user!);
  }

  /** Walks every row of this church's chain, so the page asks for it on demand. */
  @RequirePermissions('audit:read')
  @Get('summary')
  summary(@Req() req: AuthedRequest) {
    return this.audit.summary(req.user!);
  }
}

@Module({
  providers: [TenantService, AuditService],
  controllers: [AuditController],
  exports: [AuditService],
})
export class AuditModule {}
