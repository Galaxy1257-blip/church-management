import { describe, expect, it } from 'vitest';
import { buildImportPreview } from './members-import.service';

describe('member import numbers', () => {
  it('rejects existing and in-file duplicates case-insensitively', () => {
    const preview = buildImportPreview([
      { firstName: 'One', lastName: 'Person', memberNo: 'GB-00010' },
      { firstName: 'Two', lastName: 'Person', memberNo: 'gb-00010' },
      { firstName: 'Three', lastName: 'Person', memberNo: 'GB-00011' },
    ], new Set(), new Set(['GB-00011']));

    expect(preview.rows[0]?.errors).toEqual([]);
    expect(preview.rows[1]?.errors.some((error) => error.includes('duplicated within this file'))).toBe(true);
    expect(preview.rows[2]?.errors.some((error) => error.includes('already exists'))).toBe(true);
    expect(preview.validRows).toBe(1);
  });
});
