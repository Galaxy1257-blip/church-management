'use client';
// Which Sunday is being worked, and how many are in, for the screens the door
// uses.
//
// /services and /headcount/totals belong to the Services section, so they refuse
// the request when the office switches that section off — but people still walk
// in on a Sunday and somebody still counts them. A door screen that caught that
// 403 showed "No services scheduled yet" and "-" over a full church, so every
// screen that needs the Sunday asks this one question instead of re-reading the
// section's endpoints.
import { api } from './api';
import { hasPermission, isDoorRole, moduleEnabled, type ModuleFlags } from './access';

export interface DoorService {
  id: string;
  name: string;
  startsAt: string;
  status: string;
}

export interface DoorSegment {
  segmentKey: string;
  label: string;
  net: number;
}

export interface DoorView {
  services: DoorService[];
  currentId: string | null;
  counted: number;
  segments: DoorSegment[];
}

const EMPTY: DoorView = { services: [], currentId: null, counted: 0, segments: [] };

/**
 * Only the door roles get the fallback. A pastor who switched Services off
 * switched that data away on purpose; the person standing at the door did not
 * choose the switch and still has to know what they are counting into.
 */
export async function doorView(
  granted: readonly string[],
  roles: readonly string[] | undefined,
  modules?: ModuleFlags,
): Promise<DoorView> {
  if (moduleEnabled(modules, 'worship') || !isDoorRole(roles) || !hasPermission(granted, 'checkin:write')) {
    const services = await api<DoorService[]>('/services').catch(() => []);
    const current = services.find((s) => s.status === 'OPEN') ?? services[0] ?? null;
    const totals = current
      ? await api<{ totals: DoorSegment[]; netTotal: number }>(`/headcount/totals?serviceId=${current.id}`).catch(() => null)
      : null;
    return { services, currentId: current?.id ?? null, counted: totals?.netTotal ?? 0, segments: totals?.totals ?? [] };
  }
  const setup = await api<{
    currentId: string | null;
    services: DoorService[];
    counted: number;
    segments: DoorSegment[];
  }>('/checkin/setup').catch(() => null);
  return setup ?? EMPTY;
}
