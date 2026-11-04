// Welfare money is approved by a person who has to read the situation, and the
// situation is stored encrypted. So the list hands back the words and keeps the
// encrypted material on the server: the old shape spread the whole row, cipher
// included, to every browser with welfare:read. These are the three halves of
// the rule — readable, stripped, and still only this church's rows.
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import type { AuthUser } from '../common/guards';
import { encryptNote } from './crypto';
import { CareService } from './care.module';

const user = { userId: 'u1', churchId: 'c1', roles: ['PASTOR'], permissions: ['welfare:read'] } as AuthUser;

/**
 * A tenant with just enough of Prisma for the real envelope crypto to run: the
 * per-church data key is created and read back from one fake ChurchKey table, so
 * a row added through `put` and read back by the service takes the same trip the
 * app takes in production. `where` records what the list asked the database for.
 */
function world() {
  const rows: Record<string, unknown>[] = [];
  const where: unknown[] = [];
  const keys: { churchId: string; version: number; wrappedKey: Uint8Array }[] = [];
  const tx = {
    welfareRequest: {
      findMany: async (args: { where: { churchId: string } }) => {
        where.push(args.where);
        return rows.filter((r) => r.churchId === args.where.churchId);
      },
    },
    member: {
      findMany: async (args: { where: { id: { in: string[] } } }) =>
        [{ id: 'm1', firstName: 'Ama', lastName: 'Mensah', phoneE164: null, address: null, photoDataUrl: null }]
          .filter((m) => args.where.id.in.includes(m.id)),
    },
    churchKey: {
      findFirst: async (args: { where: { churchId: string } }) =>
        keys.filter((x) => x.churchId === args.where.churchId).sort((a, b) => b.version - a.version)[0] ?? null,
      create: async ({ data }: { data: { churchId: string; version: number; wrappedKey: Uint8Array } }) => {
        keys.push(data);
        return data;
      },
    },
  };
  const svc = new CareService({ run: (_u: AuthUser, fn: (t: unknown) => Promise<unknown>) => fn(tx) } as never);
  const put = async (plain: string, over: Record<string, unknown> = {}) => {
    const enc = await encryptNote(tx as never, 'c1', plain);
    rows.push({
      id: 'w1', churchId: 'c1', memberId: 'm1', category: 'RENT', status: 'SUBMITTED',
      amountRequestedMinor: 40000, createdAt: new Date('2026-11-01T09:00:00Z'),
      descriptionCipher: enc.cipher, nonce: enc.nonce, keyVersion: enc.keyVersion, ...over,
    });
  };
  return { svc, put, where };
}

describe('the welfare list', () => {
  it('gives the office the situation in words', async () => {
    const w = world();
    await w.put('Rent is two months behind.');
    const [out] = await w.svc.welfare(user);
    expect(out.description).toBe('Rent is two months behind.');
    expect(out.member).toEqual({ id: 'm1', firstName: 'Ama', lastName: 'Mensah', phoneE164: null, address: null, photoDataUrl: null });
  });

  it('keeps the cipher, nonce and key version off the response', async () => {
    const w = world();
    await w.put('Medical bill.');
    const [out] = await w.svc.welfare(user);
    expect(out).not.toHaveProperty('descriptionCipher');
    expect(out).not.toHaveProperty('nonce');
    expect(out).not.toHaveProperty('keyVersion');
    expect(out).not.toHaveProperty('churchId');
    // What a decision needs, and nothing else.
    expect(Object.keys(out).sort()).toEqual(
      ['amountRequestedMinor', 'assignedToMemberId', 'category', 'createdAt', 'description', 'id', 'member', 'memberId', 'status'],
    );
  });

  it('reads only this church’s rows', async () => {
    const w = world();
    await w.put('Rent for another church.', { churchId: 'c2' });
    expect(await w.svc.welfare(user)).toEqual([]);
    expect(w.where).toEqual([{ churchId: 'c1' }]);
  });

  it('lists a note it cannot open instead of failing the screen', async () => {
    const w = world();
    // Requests written before the tag was stored cannot be recovered: without it
    // GCM refuses the text. That one row must not take the whole list down.
    await w.put('A note nobody warned us about.', { descriptionCipher: new Uint8Array(8) });
    await w.put('Rent is two months behind.');
    const rows = await w.svc.welfare(user);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.description)).toEqual([null, 'Rent is two months behind.']);
  });
});
