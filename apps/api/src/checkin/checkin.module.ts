import { Module } from '@nestjs/common';
import { TenantService } from '../common/tenant';
import { ServicesService } from '../services/services.service';
import { HeadcountService } from '../headcount/headcount.service';
import { CheckinService } from './checkin.service';
import { CheckinController } from './checkin.controller';

@Module({
  providers: [TenantService, ServicesService, HeadcountService, CheckinService],
  controllers: [CheckinController],
})
export class CheckinModule {}
