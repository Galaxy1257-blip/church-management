import { Module } from '@nestjs/common';
import { TenantService } from '../common/tenant';
import { ServicesService } from './services.service';
import { ServicesController } from './services.controller';

@Module({
  providers: [TenantService, ServicesService],
  controllers: [ServicesController],
  exports: [ServicesService],
})
export class ServicesModule {}
