import type { Prisma } from '@prisma/client';

const PREFIX_STOP_WORDS = new Set([
  'THE', 'OF', 'AND', 'CHURCH', 'MINISTRY', 'MINISTRIES', 'INTERNATIONAL',
  'ASSEMBLIES', 'FELLOWSHIP', 'CHRISTIAN', 'CENTRE', 'CENTER',
]);

const PREFIX_LETTERS: Record<string, string> = {
  Æ: 'AE', Œ: 'OE', Ø: 'O', Đ: 'D', Ð: 'D', Ł: 'L', Þ: 'TH', ß: 'SS',
};

export function memberIdPrefix(name: string): string {
  const expanded = name.replace(/[ÆŒØĐÐŁÞß]/g, (letter) => PREFIX_LETTERS[letter] ?? letter);
  const normalized = expanded.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const words = normalized.split(/[^A-Z0-9]+/).filter(Boolean);
  const meaningful = words.filter((word) => !PREFIX_STOP_WORDS.has(word));
  let prefix = meaningful.length >= 2
    ? meaningful.slice(0, 4).map((word) => word[0]).join('')
    : (meaningful[0] ?? words.join('')).slice(0, 4);
  if (prefix.length < 2) {
    prefix = words.slice(0, 2).map((word) => word[0]).join('');
  }
  return /^[A-Z0-9]{2,4}$/.test(prefix) ? prefix : 'CH';
}

export async function lockMemberNumbers(tx: Prisma.TransactionClient, churchId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`member-no:${churchId}`}))`;
}

async function ensureCounter(tx: Prisma.TransactionClient, churchId: string) {
  const existing = await tx.memberNumberCounter.findUnique({ where: { churchId } });
  if (existing) return existing;

  const church = await tx.church.findUniqueOrThrow({
    where: { id: churchId },
    select: { name: true, memberIdPrefix: true },
  });
  const prefix = church.memberIdPrefix ?? memberIdPrefix(church.name);
  if (!church.memberIdPrefix) {
    await tx.church.update({ where: { id: churchId }, data: { memberIdPrefix: prefix } });
  }
  const rows = await tx.$queryRaw<{ max: number | null }[]>`
    SELECT COALESCE(MAX(CAST(SUBSTRING("memberNo" FROM ${prefix.length + 2}::int) AS INTEGER)), 0) AS max
    FROM "Member"
    WHERE "churchId" = ${churchId}::uuid
      AND "memberNo" ~* ${`^${prefix}-[0-9]+$`}
  `;
  return tx.memberNumberCounter.create({
    data: { churchId, prefix, nextNumber: Number(rows[0]?.max ?? 0) + 1 },
  });
}

export async function allocateMemberNo(tx: Prisma.TransactionClient, churchId: string): Promise<string> {
  await lockMemberNumbers(tx, churchId);
  const counter = await ensureCounter(tx, churchId);
  const advanced = await tx.memberNumberCounter.update({
    where: { churchId },
    data: { nextNumber: { increment: 1 } },
    select: { nextNumber: true },
  });
  return `${counter.prefix}-${String(advanced.nextNumber - 1).padStart(5, '0')}`;
}

export async function reserveMemberNo(tx: Prisma.TransactionClient, churchId: string, memberNo: string): Promise<void> {
  const value = memberNo.trim();
  if (!value) return;
  await lockMemberNumbers(tx, churchId);
  const counter = await ensureCounter(tx, churchId);
  const match = new RegExp(`^${counter.prefix}-(\\d+)$`, 'i').exec(value);
  if (!match) return;
  const number = Number(match[1]);
  if (Number.isSafeInteger(number) && number >= counter.nextNumber && number < 2_147_483_647) {
    await tx.memberNumberCounter.update({ where: { churchId }, data: { nextNumber: number + 1 } });
  }
}
