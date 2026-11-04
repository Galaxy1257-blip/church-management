// The one class-scoping rule the app has. A Sunday School teacher's whole world
// is the single class the platform office assigned to them; anyone who can
// already read the member directory (pastor, usher, elder, follow-up, office) is
// NOT narrowed, because their role is church-wide even when a class is left on
// their user record. A care-only role with no class assigned is still scoped —
// an empty list, never "everyone".
//
// Care used this rule first; the children's desk uses the same one so a teacher
// can run the pickup desk without gaining the directory.
import { ForbiddenException } from '@nestjs/common';
import type { Db } from '@chms/db';
import { hasPermission } from '@chms/shared';
import type { AuthUser } from './guards';

export type ClassScope = { bracketId: string | null; segment: 'ALL' | 'MALE' | 'FEMALE' };

/** null means this caller is not class-scoped: they see the whole church. */
export function classScopeFor(user: AuthUser): ClassScope | null {
  if (hasPermission(user.permissions, 'members:read')) return null;
  const segment = user.careClassSegment === 'MALE' || user.careClassSegment === 'FEMALE' ? user.careClassSegment : 'ALL';
  return { bracketId: user.careClassBracketId ?? null, segment };
}

/** The member rows that belong to this class. */
export function classMemberWhere(
  user: AuthUser,
  scope: { bracketId: string; segment: ClassScope['segment'] },
) {
  return {
    churchId: user.churchId,
    deletedAt: null,
    ageBracketId: scope.bracketId,
    ...(scope.segment === 'MALE'
      ? { gender: 'MALE' as const }
      : scope.segment === 'FEMALE'
        ? { gender: 'FEMALE' as const }
        : {}),
  };
}

/** The members in this teacher's class. Empty when the office has not assigned one. */
export async function classMemberIds(tx: Db, user: AuthUser, scope: ClassScope): Promise<string[]> {
  if (!scope.bracketId) return [];
  const rows = await tx.member.findMany({
    where: classMemberWhere(user, { ...scope, bracketId: scope.bracketId }),
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * The children this caller may see on the desk list — the list that names each
 * child and the adults allowed to collect them. The office (members:write) gets
 * every child, a class teacher (children:write) gets only the class the office
 * assigned, and nobody else is handed it: reading the member directory is not
 * the same as being told who may walk off with somebody's child.
 */
export async function deskRosterChildIds(tx: Db, user: AuthUser): Promise<string[] | null> {
  if (hasPermission(user.permissions, 'members:write')) return null;
  if (!hasPermission(user.permissions, 'children:write')) {
    throw new ForbiddenException('The children’s desk belongs to the office and to the class teacher.');
  }
  return teacherClassIds(tx, user);
}

/**
 * The children this caller may move through the desk: check a child in, release
 * them on a pickup code, see who is in the room. Wider than the roster on
 * purpose — the door team has always run check-in with checkin:write and keeps
 * it — while a class teacher is narrowed to their own class.
 */
export async function deskMoveChildIds(tx: Db, user: AuthUser): Promise<string[] | null> {
  if (hasPermission(user.permissions, 'members:write')) return null;
  if (hasPermission(user.permissions, 'checkin:write')) return null;
  if (!hasPermission(user.permissions, 'children:write')) {
    throw new ForbiddenException('The children’s desk belongs to the office, the door team and the class teacher.');
  }
  return teacherClassIds(tx, user);
}

/** The one class assigned to this teacher — never the whole church, never a guess. */
async function teacherClassIds(tx: Db, user: AuthUser): Promise<string[]> {
  const scope = classScopeFor(user);
  if (!scope || !scope.bracketId) {
    throw new ForbiddenException('No Sunday School class is assigned to you yet — ask the office to set one.');
  }
  return classMemberIds(tx, user, scope);
}
