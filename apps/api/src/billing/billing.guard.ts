// Global lock: once a church's paid month and grace are over, every
// tenant-scoped route answers 402 BILLING_LOCKED. Billing routes stay open
// (@BillingExempt) so a paused church can still see its bill and pay.
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BILLING_EXEMPT_KEY, PUBLIC_KEY } from '../common/decorators';
import { AuthedRequest } from '../common/guards';
import { BillingService } from './billing.service';

@Injectable()
export class BillingGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly billing: BillingService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean>(BILLING_EXEMPT_KEY, targets)) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const user = req.user;
    if (!user) return true; // public routes and platform-office routes carry no tenant user

    const snap = await this.billing.snapshot(user.churchId);
    if (!snap.locked) return true;

    throw new HttpException(
      {
        error: 'BILLING_LOCKED',
        message: 'This church workspace is paused until the monthly subscription is paid.',
        details: {
          state: snap.state,
          coveredUntil: snap.coveredUntil,
          locksAt: snap.locksAt,
        },
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
