'use client';
// Shapes returned by /billing/* — JSON dates arrive as ISO strings.
import { api } from './api';

export type BillingState = 'exempt' | 'grandfathered' | 'trial' | 'active' | 'grace' | 'paused';

export interface BillingStatus {
  state: BillingState;
  locked: boolean;
  coveredUntil: string | null;
  locksAt: string | null;
  daysLeft: number;
  graceDaysLeft: number;
  plan: string;
  amountMinor: number;
  amountLabel: string;
  billingDay: number;
  graceDays: number;
  billingEmail: string | null;
  billingPhone: string | null;
  billingNote: string | null;
  billingLocked: boolean;
  nextPeriod: string | null;
  coverageEndsAt: string | null;
  pausedAt: string | null;
  church: { name: string; slug: string };
}

export interface BillingPayment {
  id: string;
  period: string;
  amountMinor: number;
  method: 'PAYSTACK' | 'CASH' | 'TRANSFER';
  status: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED';
  reference: string;
  paidAt: string | null;
  recordedByName: string | null;
  note: string | null;
  createdAt: string;
}

export interface CheckoutResult {
  paymentId: string;
  reference: string;
  authorizationUrl: string;
  period: string;
  amountMinor: number;
  amountLabel: string;
}

export function billingStatus(): Promise<BillingStatus> {
  return api<BillingStatus>('/billing/status');
}

export function billingPayments(): Promise<BillingPayment[]> {
  return api<BillingPayment[]>('/billing/payments');
}

export function startCheckout(): Promise<CheckoutResult> {
  return api<CheckoutResult>('/billing/checkout', { method: 'POST' });
}

export function claimCash(input: {
  method: 'CASH' | 'TRANSFER';
  note?: string;
  payerName?: string;
}): Promise<BillingPayment> {
  return api<BillingPayment>('/billing/claim', { method: 'POST', body: input });
}

/** "2026-10" -> "October 2026". */
export function monthLabel(period: string): string {
  const [year, month] = period.split('-').map(Number);
  if (!year || !month) return period;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export const STATE_COPY: Record<BillingState, { label: string; tone: 'good' | 'warn' | 'bad' | 'muted' }> = {
  exempt: { label: 'No subscription', tone: 'muted' },
  grandfathered: { label: 'Active', tone: 'good' },
  trial: { label: 'Free trial', tone: 'good' },
  active: { label: 'Paid', tone: 'good' },
  grace: { label: 'Grace period', tone: 'warn' },
  paused: { label: 'Paused', tone: 'bad' },
};
