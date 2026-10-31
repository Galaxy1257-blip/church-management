import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SERVICE_SCHEDULE,
  resolveServiceSchedule,
  serviceWindowState,
} from './service-schedule';

describe('resolveServiceSchedule', () => {
  it('defaults to Sunday 07:30–12:00 when nothing is saved', () => {
    expect(resolveServiceSchedule(undefined)).toEqual(DEFAULT_SERVICE_SCHEDULE);
    expect(resolveServiceSchedule({})).toEqual(DEFAULT_SERVICE_SCHEDULE);
    expect(resolveServiceSchedule(null).startTime).toBe('07:30');
    expect(resolveServiceSchedule({}).enabled).toBe(true);
  });

  it('reads a saved window and cleans skip dates', () => {
    const s = resolveServiceSchedule({
      serviceSchedule: {
        enabled: false,
        weekday: 0,
        startTime: '08:00',
        endTime: '11:30',
        name: '  First service  ',
        skipDates: ['2026-12-27', '2026-12-27', 'nope', '2026-12-20'],
      },
    });
    expect(s).toEqual({
      enabled: false,
      weekday: 0,
      startTime: '08:00',
      endTime: '11:30',
      name: 'First service',
      skipDates: ['2026-12-20', '2026-12-27'],
    });
  });

  it('falls back field by field on junk input', () => {
    const s = resolveServiceSchedule({
      serviceSchedule: { weekday: 9, startTime: '7:30', endTime: '06:00', name: '', skipDates: 'x' },
    });
    expect(s.weekday).toBe(0);
    expect(s.startTime).toBe('07:30');
    expect(s.endTime).toBe('12:00');
    expect(s.name).toBe('Sunday Service');
    expect(s.skipDates).toEqual([]);
  });
});

describe('serviceWindowState', () => {
  const schedule = DEFAULT_SERVICE_SCHEDULE;

  it('is off on other weekdays and when disabled', () => {
    expect(serviceWindowState({ schedule, weekday: 1, timeHhMm: '08:00', dateKey: '2026-11-02' })).toBe('off');
    expect(
      serviceWindowState({ schedule: { ...schedule, enabled: false }, weekday: 0, timeHhMm: '08:00', dateKey: '2026-11-01' }),
    ).toBe('off');
  });

  it('walks the Sunday window edges', () => {
    const at = (timeHhMm: string) =>
      serviceWindowState({ schedule, weekday: 0, timeHhMm, dateKey: '2026-11-01' });
    expect(at('07:29')).toBe('before');
    expect(at('07:30')).toBe('open');
    expect(at('11:59')).toBe('open');
    expect(at('12:00')).toBe('after');
    expect(at('13:15')).toBe('after');
  });

  it('skips a Sunday marked no church', () => {
    const skip = { ...schedule, skipDates: ['2026-11-01'] };
    expect(serviceWindowState({ schedule: skip, weekday: 0, timeHhMm: '08:00', dateKey: '2026-11-01' })).toBe(
      'skipped',
    );
    expect(serviceWindowState({ schedule: skip, weekday: 0, timeHhMm: '08:00', dateKey: '2026-11-08' })).toBe('open');
  });
});
