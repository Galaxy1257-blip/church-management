import { describe, expect, it } from 'vitest';
import { parseCsv, rowsToObjects, toCsv } from './csv';

describe('parseCsv', () => {
  it('parses simple csv', () => {
    const r = parseCsv('a,b\n1,2\n3,4\n');
    expect(r.headers).toEqual(['a', 'b']);
    expect(r.rows).toEqual([['1', '2'], ['3', '4']]);
  });

  it('handles quoted fields with commas, quotes and newlines', () => {
    const r = parseCsv('name,note\r\n"Doe, John","say ""hi"""\r\n"Multi\nline",x\r\n');
    expect(r.rows).toEqual([
      ['Doe, John', 'say "hi"'],
      ['Multi\nline', 'x'],
    ]);
  });

  it('strips BOM and trims headers', () => {
    const r = parseCsv('\uFEFF name , age \nKwame,30\n');
    expect(r.headers).toEqual(['name', 'age']);
  });

  it('rejects malformed input', () => {
    expect(() => parseCsv('')).toThrow();
    expect(() => parseCsv('a,b\n1\n')).toThrow(/row 2/);
    expect(() => parseCsv('a,a\n1,2\n')).toThrow(/duplicate/);
    expect(() => parseCsv('a,b\n"unterminated,2\n')).toThrow();
    expect(() => parseCsv('a,,b\n1,2,3\n')).toThrow(/empty header/);
  });

  it('objects + toCsv round trip', () => {
    const parsed = parseCsv('phone,firstName\n0241234567,Kwame\n');
    expect(rowsToObjects(parsed)).toEqual([{ phone: '0241234567', firstName: 'Kwame' }]);
    const csv = toCsv(['phone', 'firstName'], [['0241234567', 'Kwame, Jr']]);
    expect(parseCsv(csv).rows).toEqual([['0241234567', 'Kwame, Jr']]);
  });
});
