// Dev-only helpers: simulate a Paystack webhook (HMAC-signed, same code path
// as production) so the give->settle->receipt loop can be exercised locally
// without sandbox keys. Disabled when NODE_ENV=production.
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Inject,
  Module,
  Post,
} from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { Public } from '../common/decorators';
import { Env } from '../env';
import { GivingModule } from '../giving/giving.module';
import { GivingService, paystackSecret } from '../giving/giving.service';

class MockCompleteDto {
  reference!: string;
  success?: boolean;
  amountMinor?: number;
}

@Controller('dev')
export class DevController {
  constructor(
    @Inject('ENV') private readonly env: Env,
    private readonly giving: GivingService,
  ) {}

  /**
   * Complete a mock payment: builds a Paystack-shaped charge.success/failed
   * event, signs it with the same HMAC scheme production verifies, and runs it
   * through GivingService.handlePaystackEvent — the exact code path the real
   * webhook uses after signature checks.
   */
  @Public()
  @Post('mock-paystack/complete')
  @HttpCode(200)
  async complete(@Body() body: MockCompleteDto) {
    if (this.env.NODE_ENV === 'production') {
      throw new BadRequestException('dev endpoints are disabled in production');
    }
    if (!body?.reference) throw new BadRequestException('reference required');

    const txRow = await this.giving.findByReference(body.reference);
    if (!txRow) throw new BadRequestException('unknown reference');

    const success = body.success !== false;
    const event = {
      id: `mock_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      event: success ? 'charge.success' : 'charge.failed',
      data: {
        reference: body.reference,
        amount: success ? txRow.chargedMinor : (body.amountMinor ?? txRow.chargedMinor),
        currency: 'GHS',
        channel: 'mobile_money',
        paid_at: new Date().toISOString(),
        gateway_response: success ? 'Successful' : 'Declined',
      },
    };
    // Sign to prove the payload shape matches what the webhook expects.
    const raw = JSON.stringify(event);
    const sig = createHmac('sha512', paystackSecret(this.env)).update(raw).digest('hex');
    if (sig.length !== 128) throw new BadRequestException('signature generation failed');

    return this.giving.handlePaystackEvent(event);
  }
}

@Module({
  imports: [GivingModule],
  controllers: [DevController],
})
export class DevModule {}
