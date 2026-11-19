import { describe, expect, it } from 'vitest';
import { addModuleRequest, asModuleRequests, clearEnabledRequests, removeModuleRequest, type ModuleRequest } from './module-requests';

const r = (module: string, byName = 'Ama'): ModuleRequest => ({ module, by: 'u1', byName, at: '2026-11-19T00:00:00.000Z' });

describe('module requests (prompt-only: requests never flip a switch)', () => {
  it('keeps one open request per section, newest wins', () => {
    const list = addModuleRequest(addModuleRequest([], r('worship', 'Ama')), r('worship', 'Kojo'));
    expect(list).toHaveLength(1);
    expect(list[0].byName).toBe('Kojo');
  });

  it('keeps requests for different sections side by side', () => {
    expect(addModuleRequest(addModuleRequest([], r('worship')), r('care'))).toHaveLength(2);
  });

  it('removes a dismissed request without touching others', () => {
    const list = [r('worship'), r('care')];
    expect(removeModuleRequest(list, 'worship').map((x) => x.module)).toEqual(['care']);
  });

  it('clears requests for sections that are now on', () => {
    const list = [r('worship'), r('care')];
    expect(clearEnabledRequests(list, { worship: true }).map((x) => x.module)).toEqual(['care']);
  });

  it('ignores malformed stored values', () => {
    expect(asModuleRequests('nope')).toEqual([]);
    expect(asModuleRequests([{ module: 'worship', by: 'u', byName: 'A', at: 't' }, { bad: true }, null])).toHaveLength(1);
  });
});
