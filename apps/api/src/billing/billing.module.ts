import { Module } from '@nestjs/common';
import type { Env } from '../env';
import { PAYMENT_PROVIDER, paymentProviderFactory } from '../platform/payment-provider';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  providers: [
    BillingService,
    { provide: PAYMENT_PROVIDER, useFactory: (env: Env) => paymentProviderFactory(env), inject: ['ENV'] },
  ],
  controllers: [BillingController],
  exports: [BillingService],
})
export class BillingModule {}
