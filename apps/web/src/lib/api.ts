'use client';
// API client: bearer access token in memory, refresh token in localStorage,
// single-flight refresh on 401. All calls hit /api/v1.

const LEGACY_API_URL_KEY = 'chms.api_url';
let legacyKeyCleared = false;

export function getApiBase(): string {
  // Always the build-time env var. An older dev/tunnel build stored an override
  // in localStorage; clear it once per page load instead of on every call (this
  // runs for every request the app makes).
  if (!legacyKeyCleared && typeof window !== 'undefined') {
    localStorage.removeItem(LEGACY_API_URL_KEY);
    legacyKeyCleared = true;
  }
  return (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/+$/, '');
}

/** @deprecated — URL is now fixed at build time via NEXT_PUBLIC_API_URL */
export function setCustomApiUrl(_url: string): void {
  // no-op — kept for import compatibility
}

interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
}

const REFRESH_KEY = 'chms.refresh';
let accessToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;

export function setTokens(t: Tokens): void {
  accessToken = t.accessToken;
  if (typeof window !== 'undefined') localStorage.setItem(REFRESH_KEY, t.refreshToken);
}

export function clearTokens(): void {
  accessToken = null;
  if (typeof window !== 'undefined') localStorage.removeItem(REFRESH_KEY);
}

export function hasSession(): boolean {
  return accessToken !== null || (typeof window !== 'undefined' && !!localStorage.getItem(REFRESH_KEY));
}

async function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const rt = typeof window !== 'undefined' ? localStorage.getItem(REFRESH_KEY) : null;
    if (!rt) return false;
    try {
      const res = await fetch(`${getApiBase()}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });
      if (!res.ok) {
        clearTokens();
        return false;
      }
      const tokens = (await res.json()) as Tokens;
      setTokens(tokens);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; retry?: boolean } = {},
): Promise<T> {
  const doFetch = async (): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(`${getApiBase()}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  };

  let res = await doFetch();
  if (res.status === 401 && opts.retry !== false) {
    const ok = await refreshSession();
    if (ok) res = await doFetch();
  }
  if (!res.ok) {
    let code = 'ERROR';
    let message = `request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } };
      if (body.error) {
        code = body.error.code ?? code;
        message = body.error.message ?? message;
      }
    } catch {
      /* non-json error */
    }
    throw new ApiError(res.status, code, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Raw POST that returns the Response (used by public give + webhooks). */
export async function apiRaw(path: string, body: unknown): Promise<Response> {
  return fetch(`${getApiBase()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
