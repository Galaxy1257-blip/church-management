import { describe, expect, it } from 'vitest';
import type { Env } from '../env';
import { MockPaymentProvider } from './payment-provider';

// Only WEB_URL matters for initialize(); the rest of Env is irrelevant here.
const provider = (webUrl: string) =>
  new MockPaymentProvider({ WEB_URL: webUrl } as unknown as Env);

const input = { reference: 'chms_1', amountMinor: 1000, currency: 'GHS' };

describe('MockPaymentProvider.initialize authorizationUrl', () => {
  it('builds the mock-pay link from a single origin', async () => {
    const { authorizationUrl } = await provider('https://chms-web.onrender.com').initialize(input);
    expect(authorizationUrl).toBe('https://chms-web.onrender.com/give/mock-pay?ref=chms_1');
  });

  it('uses the first origin when WEB_URL is a comma-separated CORS allowlist', async () => {
    const { authorizationUrl } = await provider(
      'https://chms-web.onrender.com, http://localhost:3000',
    ).initialize(input);
    expect(authorizationUrl).toBe('https://chms-web.onrender.com/give/mock-pay?ref=chms_1');
    expect(authorizationUrl).not.toContain(',');
  });

  it('strips a trailing slash and URL-encodes the reference', async () => {
    const { authorizationUrl } = await provider('http://localhost:3000/').initialize({
      ...input,
      reference: 'chms a/b',
    });
    expect(authorizationUrl).toBe('http://localhost:3000/give/mock-pay?ref=chms%20a%2Fb');
  });
});
