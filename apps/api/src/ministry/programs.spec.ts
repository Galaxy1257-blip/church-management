import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ProgramsService } from './programs.module';

vi.mock('@chms/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@chms/db')>();
  return { ...actual, appendAudit: vi.fn(async () => undefined) };
});

const user = { userId: 'u1', churchId: 'c1' } as never;

function fakeTenant(opts: { existingKey?: string; member?: Record<string, unknown> }) {
  const created: Record<string, unknown>[] = [];
  const tx = {
    program: { findFirst: async () => ({ id: 'p1', churchId: 'c1', name: 'Birthdays', dateField: 'DOB', remindDays: 7, active: true }) },
    member: { findFirst: async () => opts.member ?? null },
    notification: {
      findUnique: async () => (opts.existingKey ? { id: 'n1', dedupeKey: opts.existingKey } : null),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: 'n-new', ...data };
      },
    },
  };
  return { run: (_u: unknown, fn: (t: unknown) => Promise<unknown>) => fn(tx), created };
}

// A member whose birthday is guaranteed to be in the future: one month ahead.
function futureBirthdayMember() {
  const next = new Date();
  next.setMonth(next.getMonth() + 1);
  return {
    id: 'm1',
    firstName: 'Ama',
    lastName: 'Mensah',
    memberNo: 'M001',
    dob: new Date(Date.UTC(1990, next.getUTCMonth(), next.getUTCDate())),
    joinedAt: null,
    salvationDate: null,
    baptismDate: null,
    marriageDate: null,
    ordinationDate: null,
  };
}

describe('ProgramsService.approve', () => {
  it('pushes one whole-church notification for the milestone', async () => {
    const tenant = fakeTenant({ member: futureBirthdayMember() });
    const svc = new ProgramsService(tenant as never);
    const out = await svc.approve(user, 'p1', 'm1');
    expect(out.approved).toBe(true);
    expect(tenant.created).toHaveLength(1);
    const row = tenant.created[0];
    expect(row.kind).toBe('PROGRAM');
    expect(row.memberId).toBeNull(); // the whole church sees it
    expect(String(row.dedupeKey)).toMatch(/^program:p1:m1:\d{2}-\d{2}$/);
    expect(String(row.title)).toContain("Ama Mensah's");
  });

  it('refuses the same milestone twice in a year', async () => {
    const tenant = fakeTenant({ member: futureBirthdayMember(), existingKey: 'program:p1:m1:01-01' });
    const svc = new ProgramsService(tenant as never);
    await expect(svc.approve(user, 'p1', 'm1')).rejects.toThrow(/already sent/i);
    expect(tenant.created).toHaveLength(0);
  });

  it('refuses a member with no date for the program', async () => {
    const tenant = fakeTenant({
      member: { ...futureBirthdayMember(), dob: null },
    });
    const svc = new ProgramsService(tenant as never);
    await expect(svc.approve(user, 'p1', 'm1')).rejects.toThrow(/no date/i);
    expect(tenant.created).toHaveLength(0);
  });
});
