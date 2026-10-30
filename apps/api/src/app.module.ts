import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { EnvModule } from './env.module';
import { BootCheckService } from './common/boot-check';
import { JwtAuthGuard, PermissionsGuard } from './common/guards';
import { BillingGuard } from './billing/billing.guard';
import { BillingModule } from './billing/billing.module';
import { PlatformOfficeModule } from './platform-office/platform.module';
import { TenantService } from './common/tenant';
import { HealthController } from './health.controller';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { ChurchesModule } from './churches/churches.controller';
import { MembersModule } from './members/members.module';
import { ServicesModule } from './services/services.module';
import { HeadcountModule } from './headcount/headcount.module';
import { CheckinModule } from './checkin/checkin.module';
import { VisitorsModule } from './visitors/visitors.module';
import { GivingModule } from './giving/giving.module';
import { FinanceModule } from './finance/finance.module';
import { SmsModule } from './sms/sms.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { DemographicsModule } from './demographics/demographics.controller';
import { GroupsModule } from './ministry/groups.module';
import { RosterModule } from './ministry/roster.module';
import { BranchesModule } from './ministry/branches.module';
import { HouseholdsModule } from './ministry/households.module';
import { PledgesModule } from './ministry/pledges.module';
import { ExpensesModule } from './ministry/expenses.module';
import { CareModule } from './ministry/care.module';
import { EventsModule } from './ministry/events.module';
import { AnnouncementsModule } from './ministry/announcements.module';
import { FollowupAdminModule } from './ministry/followup-admin.module';
import { PushModule } from './ministry/push.module';
import { ChildrenModule } from './ministry/children.module';
import { WhatsAppModule } from './ministry/whatsapp.module';
import { PortalModule } from './portal/portal.module';
import { BibleModule } from './bible/bible.module';
import { PublicModule } from './public/public.controller';
import { DevModule } from './dev/dev.controller';
import { QueuesModule } from './queues/queues.module';

@Module({
  imports: [
    EnvModule,
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
    JwtModule.register({ global: true }),
    QueuesModule,
    BillingModule,
    PlatformOfficeModule,
    ChurchesModule,
    MembersModule,
    ServicesModule,
    HeadcountModule,
    CheckinModule,
    VisitorsModule,
    GivingModule,
    FinanceModule,
    SmsModule,
    WebhooksModule,
    DemographicsModule,
    GroupsModule,
    RosterModule,
    BranchesModule,
    HouseholdsModule,
    PledgesModule,
    ExpensesModule,
    CareModule,
    EventsModule,
    AnnouncementsModule,
    FollowupAdminModule,
    PushModule,
    ChildrenModule,
    WhatsAppModule,
    PortalModule,
    BibleModule,
    PublicModule,
    ...(process.env.NODE_ENV === 'production' ? [] : [DevModule]),
  ],
  controllers: [HealthController, AuthController],
  providers: [
    TenantService,
    AuthService,
    BootCheckService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: BillingGuard },
  ],
})
export class AppModule {}

