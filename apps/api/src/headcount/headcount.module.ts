import { Module } from '@nestjs/common';
import { TenantService } from '../common/tenant';
import { HeadcountService } from './headcount.service';
import { HeadcountController } from './headcount.controller';

@Module({
  providers: [TenantService, HeadcountService],
  controllers: [HeadcountController],
  exports: [HeadcountService],
})
export class HeadcountModule {}
