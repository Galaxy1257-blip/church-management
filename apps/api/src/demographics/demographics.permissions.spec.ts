// Audit round 5, point 7: two jobs used to be paid for with the permission to edit
// a member. `POST /demographics/promotions/run` moves every child who has had a
// birthday, and a branch transfer moves one person between congregations with a
// second leader's approval. They now have their own permissions so a church can
// hand one of them out without opening the member record — which only works if the
// roles that already did the work keep doing it. These tests pin that handover.
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { MODULE_KEY, PERMISSIONS_KEY } from '../common/decorators';
import { BranchesController } from '../ministry/branches.module';
import { MembersController } from '../members/members.controller';
import { DemographicsController } from './demographics.controller';

/** The permission list a route declares with @RequirePermissions. */
function required(handler: unknown): unknown {
  return Reflect.getMetadata(PERMISSIONS_KEY, handler as object);
}

/** The app section a route declares with @ForModule, or undefined when it has none. */
function section(handler: unknown): unknown {
  return Reflect.getMetadata(MODULE_KEY, handler as object);
}

describe('the two jobs that came off members:write', () => {
  it('asks for the bulk promotion run by its own permission', () => {
    expect(required(DemographicsController.prototype.runPromotions)).toEqual(['demographics:write']);
  });

  it('keeps the promotion run answerable to the Members switch', () => {
    // The job lives on the Members screen, so a church that switches that section
    // off has to be able to turn the route off with it. The reads stay ungated:
    // the office and the children's desk both need the brackets with Members off.
    expect(section(DemographicsController.prototype.runPromotions)).toBe('people');
    for (const name of ['brackets', 'saveBrackets', 'settings', 'saveSettings', 'counts'] as const) {
      expect(section((DemographicsController.prototype as never as Record<string, unknown>)[name])).toBeUndefined();
    }
  });

  it('asks for both halves of a transfer by the branch permission', () => {
    expect(required(BranchesController.prototype.requestTransfer)).toEqual(['branches:write']);
    expect(required(BranchesController.prototype.approve)).toEqual(['branches:write']);
  });

  it('leaves the other branch routes answering to the jobs they always had', () => {
    // Reading a branch list is reading the church; opening one is a settings change
    // and moving the money is finance. None of those is a member edit, so none of
    // them moved when the transfer did.
    expect(required(BranchesController.prototype.list)).toEqual(['church:read']);
    expect(required(BranchesController.prototype.create)).toEqual(['settings:write']);
    expect(required(BranchesController.prototype.submitRemittance)).toEqual(['giving:write']);
  });

  it('keeps editing a member on members:write', () => {
    // The split covers the two jobs above and nothing else: add, update, remove,
    // milestones and stages are still ordinary member editing, so a role without
    // either new permission behaves exactly as it did before.
    for (const name of ['create', 'update', 'remove', 'issueQr', 'milestones', 'setStage'] as const) {
      expect(required((MembersController.prototype as never as Record<string, unknown>)[name])).toEqual([
        'members:write',
      ]);
    }
  });
});
