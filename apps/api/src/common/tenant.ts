// Feature modules must NEVER import the bare Prisma client (ground rule 3).
// TenantService is the injection point: it binds the request's church/user/
// branch scope into withTenant so RLS sees app.church_id on every query.
import { Injectable } from '@nestjs/common';
import { withTenant, Db } from '@chms/db';
import { AuthUser } from './guards';

@Injectable()
export class TenantService {
  run<T>(user: AuthUser, fn: (tx: Db) => Promise<T>): Promise<T> {
    return withTenant(user.churchId, user.userId, fn, { branchIds: user.branchIds });
  }

  /** For webhook contexts where we know the church but have no session user. */
  runAsChurch<T>(churchId: string, fn: (tx: Db) => Promise<T>): Promise<T> {
    return withTenant(churchId, null, fn);
  }
}
