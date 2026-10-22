import { Module } from '@nestjs/common';
import { TenantService } from '../common/tenant';
import { CheckinService } from './checkin.service';
import { CheckinController } from './checkin.controller';

@Module({
  providers: [TenantService, CheckinService],
  controllers: [CheckinController],
})
export class CheckinModule {}
