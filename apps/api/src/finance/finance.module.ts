import { Module } from '@nestjs/common';
import { TenantService } from '../common/tenant';
import { ServicesService } from '../services/services.service';
import { FinanceService } from './finance.service';
import { FinanceController } from './finance.controller';

@Module({
  providers: [TenantService, FinanceService, ServicesService],
  controllers: [FinanceController],
})
export class FinanceModule {}
