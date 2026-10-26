// Payment provider abstraction. PAYSTACK_MODE=mock needs no keys (local dev
// + tests); live uses Paystack sandbox keys. Ghana MoMo/USD/subaccount details
// are marked *verify* in BUILD_ORDER — never guessed here.
import { Injectable, Logger } from '@nestjs/common';
import type { Env } from '../env';

export interface InitializeInput {
  reference: string;
  amountMinor: number; // pesewas
  currency: string; // GHS
  email?: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface InitializeResult {
  authorizationUrl: string;
}

export interface VerifyResult {
  status: 'success' | 'failed' | 'pending' | 'abandoned' | 'not_found';
  amountMinor: number | null;
  raw: unknown;
}

export abstract class PaymentProvider {
  abstract readonly mode: 'mock' | 'live';
  abstract initialize(input: InitializeInput): Promise<InitializeResult>;
  abstract verify(reference: string): Promise<VerifyResult>;
}

@Injectable()
export class MockPaymentProvider extends PaymentProvider {
  readonly mode = 'mock' as const;
  private readonly logger = new Logger('MockPaystack');

  constructor(private readonly env: Env) {
    super();
  }

  async initialize(input: InitializeInput): Promise<InitializeResult> {
    this.logger.log(`mock initialize ref=${input.reference} amount=${input.amountMinor}`);
    // WEB_URL is a comma-separated CORS allowlist (see main.ts), e.g.
    // "https://chms-web.onrender.com,http://localhost:3000". Outbound links must
    // target the canonical first origin - appending a path to the whole list would
    // produce "https://a,http://b/give/mock-pay?ref=...".
    const webUrl = (this.env.WEB_URL.split(',')[0] ?? '').trim().replace(/\/+$/, '');
    return { authorizationUrl: `${webUrl}/give/mock-pay?ref=${encodeURIComponent(input.reference)}` };
  }

  async verify(reference: string): Promise<VerifyResult> {
    // The mock only settles via webhook (like Paystack does in practice).
    // The stuck-PENDING sweeper uses this: pending forever => abandoned after 24h.
    return { status: 'pending', amountMinor: null, raw: { mock: true, reference } };
  }
}

@Injectable()
export class PaystackProvider extends PaymentProvider {
  readonly mode = 'live' as const;
  private readonly logger = new Logger('Paystack');

  constructor(private readonly env: Env) {
    super();
    if (!env.PAYSTACK_SECRET_KEY) {
      throw new Error('PAYSTACK_MODE=live requires PAYSTACK_SECRET_KEY (use sandbox keys)');
    }
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    };
  }

  async initialize(input: InitializeInput): Promise<InitializeResult> {
    const res = await fetch(`${this.env.PAYSTACK_BASE_URL}/transaction/initialize`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        reference: input.reference,
        amount: input.amountMinor, // GH pesewas == Paystack minor units
        currency: input.currency,
        email: input.email,
        callback_url: input.callbackUrl,
        metadata: input.metadata,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`initialize failed ${res.status}: ${text}`);
      throw new Error(`paystack initialize failed: ${res.status}`);
    }
    const body = (await res.json()) as { data?: { authorization_url?: string } };
    const url = body.data?.authorization_url;
    if (!url) throw new Error('paystack initialize returned no authorization_url');
    return { authorizationUrl: url };
  }

  async verify(reference: string): Promise<VerifyResult> {
    const res = await fetch(`${this.env.PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: this.headers(),
    });
    if (res.status === 404) return { status: 'not_found', amountMinor: null, raw: null };
    if (!res.ok) throw new Error(`paystack verify failed: ${res.status}`);
    const body = (await res.json()) as {
      data?: { status?: string; amount?: number };
    };
    const s = body.data?.status;
    const status: VerifyResult['status'] =
      s === 'success' ? 'success' : s === 'failed' ? 'failed' : s === 'abandoned' ? 'abandoned' : 'pending';
    return { status, amountMinor: body.data?.amount ?? null, raw: body };
  }
}

export const PAYMENT_PROVIDER = PaymentProvider;

export function paymentProviderFactory(env: Env): PaymentProvider {
  return env.PAYSTACK_MODE === 'live' ? new PaystackProvider(env) : new MockPaymentProvider(env);
}
