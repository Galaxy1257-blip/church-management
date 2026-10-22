import { Module } from '@nestjs/common';
import { TenantService } from '../common/tenant';
import { FinanceService } from './finance.service';
import { FinanceController } from './finance.controller';

@Module({
  providers: [TenantService, FinanceService],
  controllers: [FinanceController],
})
export class FinanceModule {}
