// Member posts are a boundary, not a button: the portal refuses the write when
// the church has not switched them on, and a notice is only shown to everybody
// after a leader approves it. These are the two rules and the queue query.
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import type { AuthUser } from '../common/guards';
import { AnnouncementsService } from './announcements.module';
import { memberPostsOn } from '../portal/portal.module';

const user = { userId: 'u1', churchId: 'c1', roles: ['PASTOR'], permissions: ['campaigns:read'] } as AuthUser;

function service() {
  const asked: Record<string, unknown>[] = [];
  const tx = {
    announcement: {
      findMany: async (args: Record<string, unknown>) => { asked.push(args); return []; },
    },
    member: { findMany: async () => [] },
  };
  return { svc: new AnnouncementsService({ run: (_u: AuthUser, fn: (t: unknown) => Promise<unknown>) => fn(tx) } as never), asked };
}

describe('member posts switch', () => {
  it('is off unless the church ticked it', () => {
    expect(memberPostsOn(undefined)).toBe(false);
    expect(memberPostsOn({})).toBe(false);
    expect(memberPostsOn({ memberPosts: 'yes' })).toBe(false);
  });

  it('stays off when the News section is off — a notice would have nowhere to show', () => {
    expect(memberPostsOn({ memberPosts: true, modules: { reach: false } })).toBe(false);
  });

  it('is on only when both are on', () => {
    expect(memberPostsOn({ memberPosts: true, modules: { reach: true } })).toBe(true);
    expect(memberPostsOn({ memberPosts: true })).toBe(true);
  });
});

describe('the announcements list', () => {
  it('shows only approved notices to everybody', async () => {
    const { svc, asked } = service();
    await svc.list(user);
    expect(asked[0].where).toMatchObject({ churchId: 'c1', moderation: 'APPROVED' });
  });

  it('gives the leaders the pending queue', async () => {
    const { svc, asked } = service();
    await svc.list(user, undefined, true);
    expect(asked[0].where).toMatchObject({ churchId: 'c1', moderation: 'PENDING' });
  });
});
