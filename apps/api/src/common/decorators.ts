import { SetMetadata, applyDecorators } from '@nestjs/common';
import type { Permission } from '@chms/shared';

export const PERMISSIONS_KEY = 'chms:permissions';
export const PUBLIC_KEY = 'chms:public';

/** Default-deny: every HTTP handler must carry this or @Public(). */
export const RequirePermissions = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_KEY, permissions);

/** Mark a route as intentionally public (login, webhooks, health). Still audited where sensitive. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

export const RouteInfo = applyDecorators;
