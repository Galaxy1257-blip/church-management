// Erasure is a legal right, so the test checks the promise the Privacy Policy
// makes: the person goes, the church's books stay, and the audit entry does not
// re-store the erased personal data as a "before" snapshot.
import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';

const calls: Array<{ model: string; method: string; args: unknown[] }> = [];
const tx = new Proxy(
  {},
  {
    get(_t, model: string) {
      return new Proxy(
        {},
        {
          get(_m, method: string) {
            return (...args: unknown[]) => {
              calls.push({ model, method, args });
              if (model === 'user' && method === 'findFirst') {
                return Promise.resolve({ id: 'u1', churchId: 'c1', memberId: 'm1', phoneE164: '+233200000001' });
              }
              if (model === 'member' && method === 'findFirst') {
                return Promise.resolve({ id: 'm1', churchId: 'c1', phoneE164: '+233200000001' });
              }
              return Promise.resolve({ count: 0 });
            };
          },
        },
      );
    },
  },
) as never;

vi.mock('@chms/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@chms/db')>();
  return {
    ...actual,
    withTenant: (_church: string, _user: string, fn: (t: unknown) => Promise<unknown>) => fn(tx),
    appendAudit: vi.fn(async () => undefined),
  };
});

import { appendAudit } from '@chms/db';
import { AuthService } from './auth.service';

function service(): AuthService {
  return new AuthService({} as never, {} as never, {} as never, {} as never);
}

function call(model: string, method: string) {
  return calls.find((c) => c.model === model && c.method === method);
}

describe('self-service erasure', () => {
  it('anonymises the member and clears contact, photo and check-in token', async () => {
    calls.length = 0;
    await service().eraseMe('u1', 'c1');
    const data = (call('member', 'update')!.args[0] as { data: Record<string, unknown> }).data;
    expect(data.firstName).toBe('Deleted');
    expect(data.phoneE164).toBeNull();
    expect(data.email).toBeNull();
    expect(data.photoDataUrl).toBeNull();
    expect(data.qrToken).toBeNull();
    expect(data.deletedAt).toBeInstanceOf(Date);
  });

  it('keeps the amounts but removes the giver name and phone from the books', async () => {
    calls.length = 0;
    await service().eraseMe('u1', 'c1');
    const data = (call('transaction', 'updateMany')!.args[0] as { data: Record<string, unknown> }).data;
    expect(data).toEqual({ giverName: null, giverPhoneE164: null });
  });

  it('deletes care notes and prayer requests, and opts the old number out first', async () => {
    calls.length = 0;
    await service().eraseMe('u1', 'c1');
    expect(call('counselingNote', 'deleteMany')).toBeTruthy();
    expect(call('prayerRequest', 'deleteMany')).toBeTruthy();
    const optOut = call('smsOptOut', 'upsert')!.args[0] as { create: { phoneE164: string } };
    expect(optOut.create.phoneE164).toBe('+233200000001');
    const optIndex = calls.findIndex((c) => c.model === 'smsOptOut');
    const clearIndex = calls.findIndex((c) => c.model === 'member' && c.method === 'update');
    expect(optIndex).toBeLessThan(clearIndex);
  });

  it('revokes sessions, removes roles and leaves a sign-in that can never match', async () => {
    calls.length = 0;
    await service().eraseMe('u1', 'c1');
    expect(call('refreshToken', 'updateMany')).toBeTruthy();
    expect(call('userRole', 'deleteMany')).toBeTruthy();
    const data = (call('user', 'update')!.args[0] as { data: Record<string, unknown> }).data;
    expect(data.isActive).toBe(false);
    expect(data.passwordHash).toBeNull();
    expect(String(data.phoneE164).startsWith('deleted:')).toBe(true);
  });

  it('audits the erasure without re-storing the erased personal data', async () => {
    calls.length = 0;
    vi.mocked(appendAudit).mockClear();
    await service().eraseMe('u1', 'c1');
    const entry = vi.mocked(appendAudit).mock.calls[0][1];
    expect(entry.action).toBe('account.erase');
    expect(entry.before).toBeUndefined();
    expect(entry.after).toBeUndefined();
  });
});