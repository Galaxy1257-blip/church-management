// A child's allergy note is health data. The office keeps it and the class
// teacher's register shows it; every other role that can read the member
// directory must receive the member row without it.
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS_KEY } from '../common/decorators';
import { MembersController } from './members.controller';
import { seesAllergy } from './members.service';

describe('who may read the health note', () => {
  it('gives it to the office that keeps it', () => {
    expect(seesAllergy(['members:read', 'members:write'])).toBe(true);
  });

  it('keeps it from every directory reader without the write permission', () => {
    expect(seesAllergy(['members:read'])).toBe(false);
    expect(seesAllergy(['members:read', 'care:read'])).toBe(false);
    expect(seesAllergy([])).toBe(false);
  });

  it('only lets the office set it, on the same route that edits a member', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, MembersController.prototype.update)).toEqual(['members:write']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, MembersController.prototype.create)).toEqual(['members:write']);
  });
});
