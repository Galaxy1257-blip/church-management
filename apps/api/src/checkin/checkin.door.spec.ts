// The door has to work on a Sunday when the office has hidden the Services
// screens, and an usher helping a member check in types a name, not a hash.
// These are the two rules the check-in desk runs on: the service list comes from
// the same place the Services screen reads it (auto-open included), and the
// member search matches what a person actually says at the door — first name,
// both names in either order, member number or phone — for this church only.
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { cardPayload } from '@chms/shared';
import type { AuthUser } from '../common/guards';
import { CheckinService } from './checkin.service';

const usher = { userId: 'u1', churchId: 'c1', roles: ['USHER'], permissions: ['checkin:write'] } as AuthUser;

const MEMBERS = [
  { id: 'm1', churchId: 'c1', firstName: 'Kofi', lastName: 'Mensah', memberNo: 'M00048', phoneE164: '+233240000111' },
  { id: 'm2', churchId: 'c1', firstName: 'Ama', lastName: 'Boateng', memberNo: 'M00049', phoneE164: null },
  { id: 'm3', churchId: 'c1', firstName: 'Kofi', lastName: 'Owusu', memberNo: 'M00050', phoneE164: '+233240000112' },
  { id: 'm4', churchId: 'c2', firstName: 'Yaw', lastName: 'Mensah', memberNo: 'M00051', phoneE164: null },
];

/** A Prisma stand-in that applies the `where` the service builds, so a clause
 *  that silently dropped the church would fail the test instead of leaking rows. */
function world(attendance: { memberId?: string; serviceId?: string }[] = []) {
  const reads: { model: string; where: Record<string, any> }[] = [];
  const like = (value: string | null | undefined, term: string) =>
    (value ?? '').toLowerCase().includes(term.toLowerCase());
  const matchesPart = (m: (typeof MEMBERS)[number], clause: Record<string, any>): boolean => {
    if (clause.AND) return clause.AND.every((part: Record<string, any>) => matchesPart(m, part));
    if (clause.OR) return clause.OR.some((part: Record<string, any>) => matchesPart(m, part));
    const [field, test] = Object.entries(clause)[0];
    const term = typeof test === 'object' ? (test as any).contains : test;
    return typeof test === 'object' && (test as any).contains !== undefined
      ? like(m[field as keyof typeof m] as string | null, term)
      : m[field as keyof typeof m] === term;
  };
  const matches = (m: (typeof MEMBERS)[number], where: Record<string, any>) =>
    m.churchId === where.churchId && (where.OR ?? []).some((clause: Record<string, any>) => matchesPart(m, clause));
  const tx = {
    member: {
      findMany: async (args: { where: Record<string, any> }) => {
        reads.push({ model: 'member', where: args.where });
        return MEMBERS.filter((m) => matches(m, args.where)).map((m) => ({
          id: m.id,
          firstName: m.firstName,
          lastName: m.lastName,
          memberNo: m.memberNo,
          phoneE164: m.phoneE164,
        }));
      },
    },
    attendance: {
      findMany: async (args: { where: Record<string, any> }) =>
        attendance.filter((a) => args.where.memberId?.in?.includes(a.memberId)),
      count: async (args: { where: Record<string, any> }) =>
        attendance.filter((a) => a.serviceId === args.where.serviceId).length,
    },
  };
  const services = { list: async () => [{ id: 's1', name: 'Sunday Service', startsAt: new Date(), status: 'OPEN' }] };
  // The office only shows the Men section; the other two are in a section it
  // switched off, so the section totals cannot be the headcount at the door.
  const headcount = {
    totals: async () => ({ totals: [{ segmentKey: 'MEN', label: 'Men', net: 2 }], netTotal: 2 }),
  };
  const svc = new CheckinService(
    { run: (_u: AuthUser, fn: (t: unknown) => Promise<unknown>) => fn(tx) } as never,
    services as never,
    headcount as never,
  );
  return { svc, reads };
}

describe('the door service list', () => {
  it('opens with the service that is running and who is already in', async () => {
    const { svc } = world([
      { serviceId: 's1' },
      { serviceId: 's1' },
      { serviceId: 's1' },
      { serviceId: 's2' },
    ]);
    const out = await svc.doorSetup(usher);
    expect(out.currentId).toBe('s1');
    expect(out.services).toEqual([{ id: 's1', name: 'Sunday Service', startsAt: expect.any(Date), status: 'OPEN' }]);
    expect(out.counted).toBe(3);
    expect(out.segments).toEqual([{ segmentKey: 'MEN', label: 'Men', net: 2 }]);
  });
});

describe('finding someone at the door', () => {
  it('matches a first name, whatever else it is on the list', async () => {
    const { svc } = world();
    const out = await svc.find(usher, 'Kofi');
    expect(out.map((m) => m.id)).toEqual(['m1', 'm3']);
  });

  it('matches both names in either order, and not a half-match', async () => {
    const { svc } = world();
    expect((await svc.find(usher, 'Mensah Kofi')).map((m) => m.id)).toEqual(['m1']);
    expect((await svc.find(usher, 'Kofi Mensah')).map((m) => m.id)).toEqual(['m1']);
    expect(await svc.find(usher, 'Kofi Boateng')).toEqual([]);
  });

  it('matches the member number and the phone number', async () => {
    const { svc } = world();
    expect((await svc.find(usher, 'M00049')).map((m) => m.id)).toEqual(['m2']);
    expect((await svc.find(usher, '0240000112')).map((m) => m.id)).toEqual(['m3']);
  });

  it('says who is already in, so the usher does not check them twice', async () => {
    const { svc } = world([{ memberId: 'm1' }]);
    const out = await svc.find(usher, 'Kofi', 's1');
    expect(out.map((m) => [m.id, m.checkedIn])).toEqual([
      ['m1', true],
      ['m3', false],
    ]);
  });

  it('searches this church only, and waits for a real word', async () => {
    const { svc, reads } = world();
    expect(await svc.find(usher, 'K')).toEqual([]);
    const out = await svc.find(usher, 'Mensah');
    expect(out.map((m) => m.id)).toEqual(['m1']);
    expect(reads[reads.length - 1].where.churchId).toBe('c1');
  });
});

// Member numbers repeat across churches, so a card that does not say who
// printed it can check in the wrong person two towns away.
describe('a scanned card belongs to one church', () => {
  /** The card path only, stopped as soon as the door recognises the person. */
  function cardWorld(slug: string, onMember?: (where: Record<string, any>) => void) {
    const tx = {
      service: { findFirst: async () => ({ id: 's1', churchId: 'c1', status: 'OPEN' }) },
      church: { findUnique: async () => ({ slug }) },
      member: {
        findFirst: async (args: { where: Record<string, any> }) => {
          onMember?.(args.where);
          return { id: 'm1' };
        },
      },
      attendance: { findUnique: async () => ({ id: 'a1' }) },
    };
    return new CheckinService(
      { run: (_u: AuthUser, fn: (t: unknown) => Promise<unknown>) => fn(tx) } as never,
      { list: async () => [] } as never,
      { totals: async () => ({ totals: [], netTotal: 0 }) } as never,
    );
  }

  it('refuses a card another church printed, by name', async () => {
    const svc = cardWorld('demo');
    await expect(
      svc.checkIn(usher, { serviceId: 's1', code: cardPayload(' Grace ', 'MEM-0001'), method: 'QR' }),
    ).rejects.toThrow(/belongs to another church \(grace\)/);
  });

  it('reads its own card and looks the member up by the number inside it', async () => {
    let seen: Record<string, any> | undefined;
    const svc = cardWorld('demo', (where) => (seen = where));
    const out = await svc.checkIn(usher, { serviceId: 's1', code: cardPayload('demo', 'MEM-0001'), method: 'QR' });
    expect(out).toEqual({ alreadyCheckedIn: true, attendance: { id: 'a1' }, section: null });
    expect(seen?.OR).toEqual([
      { qrToken: expect.any(String) },
      { memberNo: { equals: 'MEM-0001', mode: 'insensitive' } },
    ]);
  });

  it('still checks in a number typed at the door', async () => {
    let seen: Record<string, any> | undefined;
    const svc = cardWorld('demo', (where) => (seen = where));
    await svc.checkIn(usher, { serviceId: 's1', code: 'MEM-0001', method: 'QR' });
    expect(seen?.OR?.[1]).toEqual({ memberNo: { equals: 'MEM-0001', mode: 'insensitive' } });
  });
});
