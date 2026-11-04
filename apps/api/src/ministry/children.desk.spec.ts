// The children's desk has to work in a church that switched the Services section
// off, so its service picker is the desk's own endpoint rather than GET /services.
// Two things make that true and both are easy to lose later: the read still goes
// through ServicesService (so the Sunday-morning auto-open keeps running), and the
// route belongs to the Children section, not the Services one.
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { MODULE_KEY, PERMISSIONS_KEY } from '../common/decorators';
import type { AuthUser } from '../common/guards';
import { ChildrenController, ChildrenService } from './children.module';

const user = { userId: 'u1', churchId: 'c1', roles: ['SUNDAY_SCHOOL'], permissions: ['services:read'] } as AuthUser;

/** Records what the desk asks the services layer for, and answers with a full row. */
function service(rows: Record<string, unknown>[], seen: unknown[]) {
  const services = { list: async (_u: AuthUser, opts: unknown) => { seen.push(opts); return rows; } };
  return new ChildrenService({} as never, services as never);
}

describe('the desk’s own service list', () => {
  it('asks the services layer for a rolling week, not the whole history', async () => {
    const seen: { from: string }[] = [];
    await service([], seen).deskServices(user);
    const day = 86_400_000;
    const from = new Date(seen[0].from).getTime();
    // Enough to cover last Sunday and a midweek service, short enough that
    // nobody checks a child into last quarter.
    expect(from).toBeGreaterThan(Date.now() - 8 * day);
    expect(from).toBeLessThan(Date.now() - 6 * day);
  });

  it('keeps the picker to what a desk needs and drops the rest of the row', async () => {
    const seen: unknown[] = [];
    const out = await service(
      [{ id: 's1', name: 'Sunday Worship', status: 'OPEN', startsAt: new Date(), closedAt: null, churchId: 'c1' }],
      seen,
    ).deskServices(user);
    expect(out).toEqual([{ id: 's1', name: 'Sunday Worship', status: 'OPEN', startsAt: expect.any(Date) }]);
  });

  it('is gated by the Children section, not the Services one', () => {
    expect(Reflect.getMetadata(MODULE_KEY, ChildrenController)).toBe('children');
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ChildrenController.prototype.deskServices)).toEqual(['services:read']);
  });
});
