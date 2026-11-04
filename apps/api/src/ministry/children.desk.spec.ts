// The children's desk has to work in a church that switched the Services section
// off, so its service picker is the desk's own endpoint rather than GET /services.
// Two things make that true and both are easy to lose later: the read still goes
// through ServicesService (so the Sunday-morning auto-open keeps running), and the
// route belongs to the Children section, not the Services one.
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { ANY_PERMISSIONS_KEY, MODULE_KEY, PERMISSIONS_KEY } from '../common/decorators';
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

// The desk routes used to be @Authenticated(), which meant the API said nothing
// about who may work the desk and relied entirely on the class-scope helper to
// refuse. The permission choice is now stated on the route; the scope helper
// stays as the second lock.
describe('who the desk says it is open to', () => {
  const desk = ['members:write', 'checkin:write', 'children:write'];

  it('names office, door team and teacher for the two writes', () => {
    expect(Reflect.getMetadata(ANY_PERMISSIONS_KEY, ChildrenController.prototype.checkIn)).toEqual(desk);
    expect(Reflect.getMetadata(ANY_PERMISSIONS_KEY, ChildrenController.prototype.checkout)).toEqual(desk);
  });

  it('keeps the roster away from the door team because it names the collectable adults', () => {
    expect(Reflect.getMetadata(ANY_PERMISSIONS_KEY, ChildrenController.prototype.roster)).toEqual([
      'members:write',
      'children:write',
    ]);
  });

  it('declares no AND permission list, so the OR is the only policy', () => {
    for (const name of ['checkIn', 'checkout', 'roster'] as const) {
      const perms = Reflect.getMetadata(PERMISSIONS_KEY, ChildrenController.prototype[name]);
      expect(perms === undefined || perms.length === 0).toBe(true);
    }
  });
});
