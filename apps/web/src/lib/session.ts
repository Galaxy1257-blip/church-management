'use client';
// One cached /auth/me per page load.
//
// The shell and the dashboard both need the session, which used to mean two or
// three identical /auth/me round trips on every navigation — the single most
// repeated request in the app. Callers now share one in-flight promise.
import { api } from './api';
import type { SessionUser } from './access';

let cached: SessionUser | null = null;
let inflight: Promise<SessionUser> | null = null;

/** The session, from cache when possible. `force` after a role/branding change. */
export function getSession(force = false): Promise<SessionUser> {
  if (!force && cached) return Promise.resolve(cached);
  if (!force && inflight) return inflight;
  inflight = api<SessionUser>('/auth/me')
    .then((session) => {
      cached = session;
      return session;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Synchronous peek for render paths that already awaited getSession(). */
export function peekSession(): SessionUser | null {
  return cached;
}

/** Drop the cache (logout, 401, or after saving profile/branding). */
export function clearSession(): void {
  cached = null;
  inflight = null;
}
