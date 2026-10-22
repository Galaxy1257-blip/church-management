import { Module } from '@nestjs/common';
import { TenantService } from '../common/tenant';
import { VisitorsService } from './visitors.service';
import { VisitorsController } from './visitors.controller';

@Module({
  providers: [TenantService, VisitorsService],
  controllers: [VisitorsController],
})
export class VisitorsModule {}
