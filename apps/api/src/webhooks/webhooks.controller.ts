import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { Public } from '../common/decorators';
import { WebhooksService } from './webhooks.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly hooks: WebhooksService) {}

  @Public()
  @Post('sms/dlr')
  @HttpCode(200)
  dlr(@Headers('x-chms-secret') secret: string | undefined, @Body() body: Record<string, unknown>) {
    this.hooks.verifySecret(secret);
    const status = String(body.status ?? '').toUpperCase();
    if (!['SENT', 'DELIVERED', 'FAILED', 'REJECTED', 'EXPIRED'].includes(status)) {
      return { status: 'ignored' };
    }
    return this.hooks.handleDlr({
      providerMessageId: String(body.providerMessageId ?? ''),
      status: status as 'SENT' | 'DELIVERED' | 'FAILED' | 'REJECTED' | 'EXPIRED',
      errorCode: body.errorCode ? String(body.errorCode) : undefined,
    });
  }

  @Public()
  @Post('sms/inbound')
  @HttpCode(200)
  inbound(@Headers('x-chms-secret') secret: string | undefined, @Body() body: Record<string, unknown>) {
    this.hooks.verifySecret(secret);
    return this.hooks.handleInbound({
      fromE164: String(body.fromE164 ?? ''),
      body: String(body.body ?? ''),
      providerId: body.providerId ? String(body.providerId) : undefined,
    });
  }
}
