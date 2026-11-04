// Counselling and welfare notes are the only encrypted text in the app, and
// AES-GCM is useless unless the tag survives: without it every read throws, so
// the office cannot open the note it is being asked to approve. The tag rides at
// the end of the ciphertext because the schema has no column for it, which makes
// the round trip the thing to hold onto — and a tampered note must fail loudly.
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { decryptNote, encryptNote } from './crypto';

/** The per-church key table, in memory: one row per church, newest version wins. */
function keyTable() {
  const rows: { churchId: string; version: number; wrappedKey: Uint8Array }[] = [];
  return {
    churchKey: {
      findFirst: async (args: { where: { churchId: string } }) =>
        rows.filter((r) => r.churchId === args.where.churchId).sort((a, b) => b.version - a.version)[0] ?? null,
      create: async (args: { data: { churchId: string; version: number; wrappedKey: Uint8Array } }) => {
        rows.push(args.data);
        return args.data;
      },
    },
  };
}

describe('note encryption', () => {
  it('opens a note again with the same church key', async () => {
    const tx = keyTable();
    const enc = await encryptNote(tx as never, 'c1', 'Pray for the family of Kwabena.');
    expect(await decryptNote(tx as never, 'c1', enc)).toBe('Pray for the family of Kwabena.');
  });

  it('keeps a second write under the same key so the first still reads', async () => {
    const tx = keyTable();
    const a = await encryptNote(tx as never, 'c1', 'first note');
    const b = await encryptNote(tx as never, 'c1', 'second note');
    expect(a.nonce).not.toEqual(b.nonce);
    expect(await decryptNote(tx as never, 'c1', a)).toBe('first note');
    expect(await decryptNote(tx as never, 'c1', b)).toBe('second note');
  });

  it('refuses a note that was altered in the database', async () => {
    const tx = keyTable();
    const enc = await encryptNote(tx as never, 'c1', 'Amount approved: 400');
    const tampered = Uint8Array.from(enc.cipher, (byte, i) => (i === 0 ? byte ^ 0x01 : byte));
    await expect(decryptNote(tx as never, 'c1', { ...enc, cipher: tampered })).rejects.toThrow();
  });

  it('will not open one church’s note with another church’s key', async () => {
    const tx = keyTable();
    const enc = await encryptNote(tx as never, 'c1', 'private to church one');
    await expect(decryptNote(tx as never, 'c2', enc)).rejects.toThrow();
  });
});
