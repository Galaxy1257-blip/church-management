'use client';
// Platform Office client: its own token (sessionStorage, not the church app's
// localStorage refresh key) and its own JSON wrapper. A 401 sends staff back to
// the office sign-in, never to the church login page.
import { getApiBase } from './api';
import type { BillingStatus } from './billing';

const TOKEN_KEY = 'chms.platform.token';
const USER_KEY = 'chms.platform.user';

export type PlatformRole = 'OWNER' | 'ONBOARDER' | 'SUPPORT';

export interface PlatformUser {
  id: string;
  name: string;
  email: string;
  role: PlatformRole;
}

export interface PlatformStaff {
  id: string;
  name: string;
  email: string;
  role: PlatformRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface CustomFeature {
  key: string;
  label: string;
  description?: string;
  href?: string;
  enabled: boolean;
}

export interface ImportPreviewRow {
  rowNumber: number;
  input: {
    firstName: string;
    lastName: string;
    phoneE164?: string;
    email?: string;
    gender?: string;
    dob?: string;
    memberNo?: string;
  };
  normalizedPhone: string | null;
  errors: string[];
  duplicateOfExisting: boolean;
  duplicateInFile: boolean;
}

export interface ImportPreview {
  totalRows: number;
  validRows: number;
  errorRows: number;
  duplicatesExisting: number;
  duplicatesInFile: number;
  rows: ImportPreviewRow[];
  errorsCsv: string;
}

export interface PlatformOverview {
  churches: number;
  states: Record<string, number>;
  mrrMinor: number;
  trialsEndingSoon: number;
  awaitingConfirmation: number;
  recent: { id: string; name: string; slug: string; createdAt: string; state: string }[];
}

export interface PlatformChurchRow {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  users: number;
  members: number;
  billing: {
    state: string;
    locked: boolean;
    coveredUntil: string | null;
    locksAt: string | null;
    daysLeft: number;
    graceDaysLeft: number;
    amountMinor: number;
    billingDay: number;
    billingLocked: boolean;
    billingExempt: boolean;
  };
}

export interface PlatformChurchUser {
  id: string;
  name: string;
  phoneE164: string;
  email: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  roles: { key: string; name: string }[];
}

export interface PlatformPayment {
  id: string;
  churchId: string;
  period: string;
  amountMinor: number;
  method: 'PAYSTACK' | 'CASH' | 'TRANSFER';
  status: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED';
  reference: string;
  paidAt: string | null;
  recordedByName: string | null;
  note: string | null;
  createdAt: string;
  church?: { name: string; slug: string };
}

export interface PlatformChurchDetail {
  church: {
    id: string;
    name: string;
    slug: string;
    createdAt: string;
    pastorDisplayName: string | null;
    modules: Record<string, boolean>;
    moduleDefaults: Record<string, boolean>;
    customFeatures: CustomFeature[];
    billing: BillingStatus;
    billingEmail: string | null;
    billingPhone: string | null;
    billingNote: string | null;
  };
  members: number;
  users: PlatformChurchUser[];
  payments: PlatformPayment[];
  audit: {
    id: string;
    action: string;
    entity: string | null;
    entity_id: string | null;
    actor_id: string | null;
    created_at: string;
  }[];
}

export function platformToken(): string | null {
  return typeof window === 'undefined' ? null : sessionStorage.getItem(TOKEN_KEY);
}

export function platformUser(): PlatformUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as PlatformUser) : null;
  } catch {
    return null;
  }
}

export function savePlatformSession(token: string, user: PlatformUser): void {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearPlatformSession(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

export class PlatformError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function platformApi<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = platformToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${getApiBase()}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401 && path !== '/platform/auth/login') {
    clearPlatformSession();
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/platform/login')) {
      window.location.replace('/platform/login');
    }
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
    throw new PlatformError(res.status, code, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
