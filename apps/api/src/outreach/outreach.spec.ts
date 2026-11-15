// #13 outreach starter: the routes answer to the outreach permissions and to the
// Outreach App-section switch, so a church that has not turned the section on gets
// a 403 from the guard before any code runs. These tests pin that the read and the
// two writes each carry the right job and the right section, and that a refusal
// speaks in office words ("see outreach"), not in a permission key.
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { MODULE_KEY, PERMISSIONS_KEY } from '../common/decorators';
import { permissionLabel } from '@chms/shared';
import { OutreachController } from './outreach.module';

function required(handler: unknown): unknown {
  return Reflect.getMetadata(PERMISSIONS_KEY, handler as object);
}

function section(handler: unknown): unknown {
  return Reflect.getMetadata(MODULE_KEY, handler as object);
}

describe('the outreach routes', () => {
  it('asks for outreach:read to list and outreach:write to add', () => {
    expect(required(OutreachController.prototype.list)).toEqual(['outreach:read']);
    expect(required(OutreachController.prototype.create)).toEqual(['outreach:write']);
    expect(required(OutreachController.prototype.addContact)).toEqual(['outreach:write']);
  });

  it('closes the whole section with the Outreach switch', () => {
    // @ForModule sits on the controller class, so it lands on each route through
    // the prototype chain (ModuleGuard reads handler then class). Pin the class.
    expect(section(OutreachController)).toBe('outreach');
  });

  it('a refusal reads in office words', () => {
    expect(permissionLabel('outreach:read')).toBe('see outreach');
    expect(permissionLabel('outreach:write')).toBe('change outreach');
  });
});