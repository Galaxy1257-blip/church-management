// "Please turn this section on" requests from staff who cannot flip the switch
// themselves. Stored in Church.settings.moduleRequests (JSON), so no migration.
// The leader sees them in Settings and turns the section on or dismisses them.
// Only the DATA lives here; the switch itself is never changed by a request.
export interface ModuleRequest {
  module: string;
  by: string;
  byName: string;
  at: string;
}

const MAX_REQUESTS = 50;

/** Add or refresh the request for one section (one open request per section). */
export function addModuleRequest(list: ModuleRequest[], request: ModuleRequest): ModuleRequest[] {
  return [...list.filter((r) => r.module !== request.module), request].slice(-MAX_REQUESTS);
}

export function removeModuleRequest(list: ModuleRequest[], module: string): ModuleRequest[] {
  return list.filter((r) => r.module !== module);
}

/** Drop requests for sections that are now on — a satisfied request is not a task. */
export function clearEnabledRequests(list: ModuleRequest[], modulesOn: unknown): ModuleRequest[] {
  const on = (modulesOn ?? {}) as Record<string, unknown>;
  return list.filter((r) => on[r.module] !== true);
}

/** Tolerate older/malformed values in the JSON column. */
export function asModuleRequests(value: unknown): ModuleRequest[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (r): r is ModuleRequest => !!r && typeof r === 'object' && typeof (r as { module?: unknown }).module === 'string',
  );
}
