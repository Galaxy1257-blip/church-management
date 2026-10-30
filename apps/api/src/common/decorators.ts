import { SetMetadata, applyDecorators } from '@nestjs/common';
import type { Permission } from '@chms/shared';

export const PERMISSIONS_KEY = 'chms:permissions';
export const PUBLIC_KEY = 'chms:public';
export const AUTHENTICATED_KEY = 'chms:authenticated';
export const BILLING_EXEMPT_KEY = 'chms:billing-exempt';

/** Default-deny: every HTTP handler must carry this or @Public(). */
export const RequirePermissions = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Signed in, but no specific permission required. Used for self-service reads
 * such as /auth/me, which a MEMBER (zero staff permissions) still needs so the
 * app shell can tell them to use the member portal. Never use it to expose
 * church data: it only asserts "there is a valid session".
 */
export const Authenticated = () => SetMetadata(AUTHENTICATED_KEY, true);

/** Mark a route as intentionally public (login, webhooks, health). Still audited where sensitive. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/**
 * Reachable even when the church's subscription is paused: billing status,
 * checkout and cash claims are how a locked church gets back in.
 */
export const BillingExempt = () => SetMetadata(BILLING_EXEMPT_KEY, true);

export const RouteInfo = applyDecorators;
