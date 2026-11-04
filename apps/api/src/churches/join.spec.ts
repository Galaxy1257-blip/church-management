// Self-add is code-gated: a stranger with the link still cannot join without the
// church's code, and the code is compared the way people type it.
import { describe, expect, it } from 'vitest';
import { joinGate, makeJoinCode } from './churches.service';

const on = { memberJoin: { enabled: true, code: 'HARVEST7' } };

describe('the church join code', () => {
  it('is off until the church switches it on', () => {
    expect(joinGate(undefined, 'HARVEST7')).toBe('off');
    expect(joinGate({ memberJoin: { enabled: false, code: 'HARVEST7' } }, 'HARVEST7')).toBe('off');
  });

  it('accepts the code however it is typed', () => {
    expect(joinGate(on, 'harvest7')).toBe('ok');
    expect(joinGate(on, '  Harvest7 ')).toBe('ok');
  });

  it('refuses a wrong code', () => {
    expect(joinGate(on, 'HARVEST8')).toBe('bad');
    expect(joinGate(on, '')).toBe('bad');
  });

  it('makes 8-character codes without look-alike letters', () => {
    const code = makeJoinCode();
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    expect(code).not.toMatch(/[0O1I]/);
  });
});
