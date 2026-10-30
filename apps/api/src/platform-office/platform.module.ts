import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { ChurchesModule } from '../churches/churches.controller';
import { PlatformAuthController, PlatformOfficeController } from './platform.controller';
import { PlatformGuard } from './platform.guard';
import { PlatformService } from './platform.service';

@Module({
  imports: [BillingModule, ChurchesModule],
  controllers: [PlatformAuthController, PlatformOfficeController],
  providers: [PlatformService, PlatformGuard],
  exports: [PlatformService],
})
export class PlatformOfficeModule {}
