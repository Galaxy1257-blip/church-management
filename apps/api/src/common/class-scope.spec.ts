// The one class-scoping rule the app has (common/class-scope.ts), checked for
// both halves of it: the class a Sunday School teacher already sees in Care, and
// the two desk lists — the pickup list, which stays with the office and their own
// class, and the desk itself, which the door team has always worked.
import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { classMemberIds, classScopeFor, deskMoveChildIds, deskRosterChildIds } from './class-scope';
import type { AuthUser } from './guards';
import { permissionsForRoles } from '@chms/shared';

type Where = Record<string, unknown>;

/** Records the where clause so the narrowing itself is what the test asserts. */
function fakeTx(rows: { id: string }[], seen: Where[]) {
  return {
    member: { findMany: async ({ where }: { where: Where }) => { seen.push(where); return rows; } },
  } as never;
}

function user(roles: string[], extra: Partial<AuthUser> = {}): AuthUser {
  return {
    userId: 'u1',
    churchId: 'c1',
    name: 'Test',
    phoneE164: '+233000000000',
    roles,
    permissions: permissionsForRoles(roles),
    branchIds: [],
    scope: 'ALL',
    ...extra,
  };
}

const teacher = user(['SUNDAY_SCHOOL'], { careClassBracketId: 'b1', careClassSegment: 'MALE' });
const unassigned = user(['SUNDAY_SCHOOL']);
const usher = user(['USHER']);
const office = user(['SECRETARY']);

describe('classScopeFor — who is narrowed to one class', () => {
  it('narrow a teacher to the class the office assigned, with its segment', () => {
    expect(classScopeFor(teacher)).toEqual({ bracketId: 'b1', segment: 'MALE' });
  });

  it('does not narrow a role that already reads the directory', () => {
    expect(classScopeFor(usher)).toBeNull();
  });

  it('keeps a care-only teacher scoped when no class is assigned', () => {
    expect(classScopeFor(unassigned)).toEqual({ bracketId: null, segment: 'ALL' });
  });
});

describe('classMemberIds — the rows behind a class scope', () => {
  it('answers with nobody, never everybody, when the class is missing', async () => {
    const seen: Where[] = [];
    expect(await classMemberIds(fakeTx([{ id: 'm1' }], seen), unassigned, { bracketId: null, segment: 'ALL' })).toEqual([]);
    expect(seen.length).toBe(0);
  });

  it('filters the class by bracket, segment and deleted rows', async () => {
    const seen: Where[] = [];
    const scope = classScopeFor(teacher)!;
    expect(await classMemberIds(fakeTx([{ id: 'm1' }], seen), teacher, scope)).toEqual(['m1']);
    expect(seen[0]).toEqual({ churchId: 'c1', deletedAt: null, ageBracketId: 'b1', gender: 'MALE' });
  });
});

describe('deskRosterChildIds — who may read the children’s pickup list', () => {
  it('gives the office the whole church, exactly as before', async () => {
    const seen: Where[] = [];
    expect(await deskRosterChildIds(fakeTx([], seen), office)).toBeNull();
    expect(seen.length).toBe(0);
  });

  it('gives a teacher only their own class', async () => {
    const seen: Where[] = [];
    expect(await deskRosterChildIds(fakeTx([{ id: 'm1' }], seen), teacher)).toEqual(['m1']);
    expect(seen[0]).toEqual({ churchId: 'c1', deletedAt: null, ageBracketId: 'b1', gender: 'MALE' });
  });

  it('refuses the door team — check-in rights do not hand over who may collect a child', async () => {
    const seen: Where[] = [];
    await expect(deskRosterChildIds(fakeTx([{ id: 'm1' }], seen), usher)).rejects.toBeInstanceOf(ForbiddenException);
    expect(seen.length).toBe(0);
  });

  it('tells a teacher with no class to ask the office instead of returning the church', async () => {
    await expect(deskRosterChildIds(fakeTx([], []), unassigned)).rejects.toThrow(/No Sunday School class is assigned/);
  });

  it('refuses a role that runs neither the office nor the desk', async () => {
    await expect(deskRosterChildIds(fakeTx([], []), user(['FINANCE_ADMIN']))).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('deskMoveChildIds — who may work the desk', () => {
  it('leaves the office with the whole church', async () => {
    expect(await deskMoveChildIds(fakeTx([], []), office)).toBeNull();
  });

  it('leaves the door team with the whole church, as it always was', async () => {
    expect(await deskMoveChildIds(fakeTx([], []), usher)).toBeNull();
  });

  it('narrows a teacher to their own class', async () => {
    const seen: Where[] = [];
    expect(await deskMoveChildIds(fakeTx([{ id: 'm1' }], seen), teacher)).toEqual(['m1']);
    expect(seen[0]).toEqual({ churchId: 'c1', deletedAt: null, ageBracketId: 'b1', gender: 'MALE' });
  });

  it('refuses anyone the office never put at the desk', async () => {
    await expect(deskMoveChildIds(fakeTx([], []), user(['FINANCE_ADMIN']))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
