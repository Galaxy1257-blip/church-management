// #40/#45: the reading card's only data path. The switches are checked inside the
// service (Bible area AND the reading's own in-app switch), so a church that turned
// the card off gets a quiet `{ inApp: false }` instead of a 403 — the dashboard and
// the member home then drop the card without printing an error. These tests pin the
// two things that makes true: the route answers to ordinary church staff, and it is
// not also gated by @ForModule, which would 403 before the rule could run.
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { MODULE_KEY, PERMISSIONS_KEY } from '../common/decorators';
import { ChurchesController } from './churches.controller';

function required(handler: unknown): unknown {
  return Reflect.getMetadata(PERMISSIONS_KEY, handler as object);
}

function section(handler: unknown): unknown {
  return Reflect.getMetadata(MODULE_KEY, handler as object);
}

describe('the in-app reading route', () => {
  it('is readable by every role that can see the dashboard', () => {
    expect(required(ChurchesController.prototype.devotionalToday)).toEqual(['church:read']);
  });

  it('is not hard-gated by a section, so the switch can answer quietly', () => {
    expect(section(ChurchesController.prototype.devotionalToday)).toBeUndefined();
  });

  it('leaves the reading settings where they were', () => {
    expect(required(ChurchesController.prototype.devotional)).toEqual(['church:read']);
    expect(required(ChurchesController.prototype.saveDevotional)).toEqual(['settings:write']);
  });
});
