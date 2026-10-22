import { Module } from '@nestjs/common';
import { TenantService } from '../common/tenant';
import { QueuesModule } from '../queues/queues.module';
import { SmsDispatcher } from './sms-dispatcher';
import { SmsService } from './sms.service';
import { SmsController } from './sms.controller';
import { GatewaySettingsController, GatewaySettingsService } from './gateway-settings';

@Module({
  imports: [QueuesModule],
  providers: [TenantService, SmsDispatcher, SmsService, GatewaySettingsService],
  controllers: [SmsController, GatewaySettingsController],
  exports: [SmsDispatcher, SmsService],
})
export class SmsModule {}
