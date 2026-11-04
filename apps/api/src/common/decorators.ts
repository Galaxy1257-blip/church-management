import { SetMetadata, applyDecorators } from '@nestjs/common';
import type { ModuleKey, Permission } from '@chms/shared';

export const PERMISSIONS_KEY = 'chms:permissions';
export const ANY_PERMISSIONS_KEY = 'chms:permissions-any';
export const PUBLIC_KEY = 'chms:public';
export const AUTHENTICATED_KEY = 'chms:authenticated';
export const BILLING_EXEMPT_KEY = 'chms:billing-exempt';
export const MODULE_KEY = 'chms:module';
export const INTAKE_KEY = 'chms:intake-module';

/** Default-deny: every HTTP handler must carry this or @Public(). */
export const RequirePermissions = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Needs at least ONE of these — the OR version of @RequirePermissions. Use it
 * where several roles legitimately do the same job and no single permission
 * covers them all (the children's desk: office, door team, class teacher).
 * Still default-deny: the route declares an access policy, it is just a choice.
 */
export const AnyPermission = (...permissions: Permission[]) => SetMetadata(ANY_PERMISSIONS_KEY, permissions);

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

/**
 * This route belongs to one App section (Settings → App sections). When the
 * church switches that section off, ModuleGuard rejects the request — the switch
 * is a real boundary, not just a hidden link.
 */
export const ForModule = (key: ModuleKey) => SetMetadata(MODULE_KEY, key);

/**
 * A @Public() door that belongs to an App section — the give link. Normally a
 * section switch only closes the office's own areas; the church is asked, when
 * they switch the section off, whether this door closes with it. The answer is
 * settings.moneyOffStopsGiving, and ModuleGuard is what acts on it. The caller
 * must put the church's slug in the body so the guard can find the answer.
 */
export const PublicIntake = (key: ModuleKey) => SetMetadata(INTAKE_KEY, key);

export const RouteInfo = applyDecorators;
