// Server-side reading of the per-church App-section switches.
//
// The switch has to mean something to the API, not only to the sidebar: a church
// that switched "Services" off must get a 403 from /services, otherwise the data
// is still reachable by typing the URL and the setting is decoration.
import { Global, Injectable, Module } from '@nestjs/common';
import { withTenant } from '@chms/db';
import { resolveModules, type ModuleFlags } from '@chms/shared';

/**
 * How long a cached flag set stays valid. Ticking a switch in Settings
 * invalidates this church's entry immediately, so the TTL only matters for a
 * second API instance (or a direct database edit).
 */
const TTL_MS = 30_000;

@Injectable()
export class ModuleFlagsService {
  private readonly cache = new Map<string, { at: number; flags: ModuleFlags }>();

  async flagsFor(churchId: string): Promise<ModuleFlags> {
    const hit = this.cache.get(churchId);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.flags;
    // Tenant-scoped read: the app role has FORCE RLS, so the church row is only
    // visible with app.church_id set — same path Settings already uses.
    const flags = await withTenant(churchId, null, async (tx) => {
      const church = await tx.church.findUnique({ where: { id: churchId }, select: { settings: true } });
      return resolveModules(church?.settings);
    });
    this.cache.set(churchId, { at: Date.now(), flags });
    return flags;
  }

  /** Called after Settings writes the switches, so the change applies at once. */
  invalidate(churchId: string) {
    this.cache.delete(churchId);
  }
}

/** Global because the guard lives in the root injector and Settings writes the flags. */
@Global()
@Module({ providers: [ModuleFlagsService], exports: [ModuleFlagsService] })
export class ModuleFlagsModule {}
