// The log is the one screen whose whole job is to be trustworthy, so the three
// things that would quietly ruin it are tested here: reading another church's
// history, telling the reader there is no more when there is, and renaming an
// action the screen has not been taught.
import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MODULE_KEY, PERMISSIONS_KEY } from '../common/decorators';
import type { AuthUser } from '../common/guards';

vi.mock('@chms/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@chms/db')>();
  return { ...actual, auditVerify: vi.fn(async () => null) };
});

import { auditVerify } from '@chms/db';
import { AuditController } from './audit.module';
import { AuditService } from './audit.service';

const user = { userId: 'u1', churchId: 'church-a' } as AuthUser;

interface Captured {
  text: string;
  values: unknown[];
}

/** A tenant whose queries are recorded instead of run, answering with fixed rows. */
function fakeDb(rows: Record<string, unknown>[]) {
  const calls: Captured[] = [];
  const tx = {
    // Both shapes the service uses: a tagged template, and a composed Prisma.sql.
    $queryRaw: (strings: TemplateStringsArray | { strings: readonly string[]; values: unknown[] }, ...values: unknown[]) => {
      const shaped = strings as { strings?: readonly string[]; values?: unknown[] };
      calls.push(
        shaped.strings
          ? { text: shaped.strings.join('?'), values: shaped.values ?? [] }
          : { text: (strings as TemplateStringsArray).join('?'), values },
      );
      return Promise.resolve(rows);
    },
  };
  return { tx, calls, tenant: { run: (_u: AuthUser, fn: (t: typeof tx) => Promise<unknown>) => fn(tx) } };
}

const row = {
  seq: 41n,
  action: 'member.update',
  entity: 'Member',
  entityId: 'm1',
  createdAt: new Date('2026-11-05T09:00:00.000Z'),
  actorId: 'u1',
  actorName: 'Pastor Yaw',
  ip: '41.58.220.10',
  before: null,
  after: null,
};

describe('reading the log', () => {
  let db: ReturnType<typeof fakeDb>;
  beforeEach(() => {
    vi.mocked(auditVerify).mockResolvedValue(null);
    db = fakeDb([row]);
  });

  it('filters to the caller’s own church in the SQL, not by trusting row-level security', async () => {
    // audit_event spells its column `church_id`, and extras.sql only forces RLS on
    // tables that spell it `churchId` — so nothing else would isolate it.
    const svc = new AuditService(db.tenant as never);
    await svc.list(user, {});
    expect(db.calls[0].text).toContain('e.church_id =');
    expect(db.calls[0].values).toContain('church-a');
  });

  it('never lets a caller ask for more than 300 lines at once', async () => {
    const svc = new AuditService(db.tenant as never);
    await svc.list(user, { limit: '9999' });
    expect(db.calls[0].values).toContain(301);
    await svc.list(user, {});
    expect(db.calls[1].values).toContain(101);
  });

  it('keeps the second page older than the first', async () => {
    const svc = new AuditService(db.tenant as never);
    await svc.list(user, { before: '41' });
    const before = db.calls[0].values.filter((v) => typeof v === 'bigint');
    expect(before).toEqual([41n]);
  });

  it('says whether there is more to come, using the one extra row it asked for', async () => {
    const two = fakeDb([row, { ...row, seq: 40n }]);
    const svc = new AuditService(two.tenant as never);
    const page = await svc.list(user, { limit: '1' });
    expect(page.items).toHaveLength(1);
    expect(page.more).toBe(true);
    expect(page.olderThan).toBe(41);
  });

  it('shows an actor-less row as no one signed in, rather than inventing a name', async () => {
    const anon = fakeDb([{ ...row, actorId: null, actorName: null }]);
    const svc = new AuditService(anon.tenant as never);
    const page = await svc.list(user, {});
    expect(page.items[0].actor).toBeNull();
  });

  it('does not search the stored before/after values, only what a person would look at', async () => {
    const svc = new AuditService(db.tenant as never);
    await svc.list(user, { q: 'givers phone' });
    expect(db.calls[0].text).not.toMatch(/before.*ilike/i);
    expect(db.calls[0].values).toContain('%givers phone%');
  });

  it('sends what happened rather than the values that were changed', async () => {
    const svc = new AuditService(db.tenant as never);
    const page = await svc.list(user, {});
    expect(db.calls[0].text).not.toContain('before');
    expect(page.items[0]).not.toHaveProperty('before');
    expect(page.items[0]).not.toHaveProperty('after');
  });

  it('reports the chain as broken at the line the verifier found', async () => {
    vi.mocked(auditVerify).mockResolvedValue(7);
    const svc = new AuditService(db.tenant as never);
    const summary = await svc.summary(user);
    expect(summary.brokenAtSeq).toBe(7);
    expect(summary.rows).toBe(0);
  });
});

describe('who the log page says it is open to', () => {
  it('belongs to its own section switch, so the church can hide the page', () => {
    expect(Reflect.getMetadata(MODULE_KEY, AuditController)).toBe('audit');
  });

  it('asks for audit:read on every route, and offers no route that writes', () => {
    for (const name of ['events', 'groups', 'summary'] as const) {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, AuditController.prototype[name])).toEqual(['audit:read']);
    }
    expect(Object.getOwnPropertyNames(AuditController.prototype).sort()).toEqual(
      ['constructor', 'events', 'groups', 'summary'],
    );
  });
});
