import { Module } from '@nestjs/common';
import { SmsModule } from '../sms/sms.module';
import { WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';

@Module({
  imports: [SmsModule],
  providers: [WebhooksService],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
