import { Module } from '@nestjs/common';
import { TenantService } from '../common/tenant';
import { PAYMENT_PROVIDER, paymentProviderFactory } from '../platform/payment-provider';
import { QueuesModule } from '../queues/queues.module';
import type { Env } from '../env';
import { GivingService } from './giving.service';
import { GivingController } from './giving.controller';

@Module({
  imports: [QueuesModule],
  providers: [
    TenantService,
    GivingService,
    { provide: PAYMENT_PROVIDER, useFactory: (env: Env) => paymentProviderFactory(env), inject: ['ENV'] },
  ],
  controllers: [GivingController],
  exports: [GivingService],
})
export class GivingModule {}
