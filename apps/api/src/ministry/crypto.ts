// Envelope encryption for counseling/welfare notes: per-church data key
// (ChurchKey row) wrapped by the master key (CHMS_MASTER_KEY, 32-byte hex).
// Body stays encrypted at rest; decryption only in-memory for authorized reads.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Db } from '@chms/db';

function masterKey(): Buffer {
  const hex = process.env.CHMS_MASTER_KEY ?? '';
  if (/^[0-9a-f]{64}$/i.test(hex)) return Buffer.from(hex, 'hex');
  // Dev fallback: deterministic derivation from JWT_SECRET (never for prod).
  return createHash('sha256').update(process.env.JWT_SECRET ?? 'dev-secret').digest();
}

async function dataKeyFor(tx: Db, churchId: string): Promise<{ key: Buffer; version: number }> {
  const existing = await tx.churchKey.findFirst({ where: { churchId }, orderBy: { version: 'desc' } });
  if (existing) {
    const iv = existing.wrappedKey.subarray(0, 12);
    const tag = existing.wrappedKey.subarray(12, 28);
    const body = existing.wrappedKey.subarray(28);
    const d = createDecipheriv('aes-256-gcm', masterKey(), iv);
    d.setAuthTag(tag);
    return { key: Buffer.concat([d.update(body), d.final()]), version: existing.version };
  }
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', masterKey(), iv);
  const body = Buffer.concat([c.update(key), c.final()]);
  const version = 1;
  await tx.churchKey.create({
    data: { churchId, version, wrappedKey: Buffer.concat([iv, c.getAuthTag(), body]) },
  });
  return { key, version };
}

export interface EncryptedField {
  cipher: Uint8Array;
  nonce: Uint8Array;
  keyVersion: number;
}

export async function encryptNote(tx: Db, churchId: string, plaintext: string): Promise<EncryptedField> {
  const { key, version } = await dataKeyFor(tx, churchId);
  const nonce = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, nonce);
  // GCM needs its 16-byte tag to decrypt, and the schema has no column for one,
  // so the tag travels at the end of the ciphertext. Left off, every read fails
  // the check and no note can ever be opened again.
  const cipher = Buffer.concat([c.update(plaintext, 'utf8'), c.final(), c.getAuthTag()]);
  return { cipher, nonce, keyVersion: version };
}

export async function decryptNote(
  tx: Db,
  churchId: string,
  field: { cipher: Uint8Array; nonce: Uint8Array; keyVersion: number },
): Promise<string> {
  const { key } = await dataKeyFor(tx, churchId);
  const tagStart = field.cipher.length - 16;
  if (tagStart < 0) throw new Error('encrypted note is too short to carry its tag');
  const d = createDecipheriv('aes-256-gcm', key, field.nonce);
  d.setAuthTag(field.cipher.subarray(tagStart));
  return Buffer.concat([d.update(field.cipher.subarray(0, tagStart)), d.final()]).toString('utf8');
}

/**
 * The same read, for a list. Notes written before the tag was stored cannot be
 * opened at all, and one of those must not fail the whole screen: the caller
 * gets null and shows that this one request has no readable situation.
 */
export async function openNote(
  tx: Db,
  churchId: string,
  field: { cipher: Uint8Array; nonce: Uint8Array; keyVersion: number },
): Promise<string | null> {
  try {
    return await decryptNote(tx, churchId, field);
  } catch {
    return null;
  }
}
