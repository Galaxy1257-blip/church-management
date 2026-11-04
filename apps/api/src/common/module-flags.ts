// Server-side reading of the per-church App-section switches.
//
// The switch has to mean something to the API, not only to the sidebar: a church
// that switched "Services" off must get a 403 from /services, otherwise the data
// is still reachable by typing the URL and the setting is decoration.
import { Global, Injectable, Module } from '@nestjs/common';
import { platformPrisma, withTenant } from '@chms/db';
import { givingStopsWithBooks, resolveModules, type ModuleFlags } from '@chms/shared';

/**
 * How long a cached flag set stays valid. Ticking a switch in Settings
 * invalidates this church's entry immediately, so the TTL only matters for a
 * second API instance (or a direct database edit).
 */
const TTL_MS = 30_000;

interface Entry {
  at: number;
  flags: ModuleFlags;
  /** The office chose "stop online giving too" when they closed the books. */
  stopsGiving: boolean;
}

@Injectable()
export class ModuleFlagsService {
  private readonly cache = new Map<string, Entry>();
  private readonly slugs = new Map<string, { at: number; churchId: string | null }>();

  async flagsFor(churchId: string): Promise<ModuleFlags> {
    return (await this.entryFor(churchId)).flags;
  }

  /**
   * Is the public give link closed? Only when the office both switched Offerings
   * off and answered "stop online giving too" — an off switch alone keeps the
   * congregation's door open.
   */
  async givingDoorClosed(churchId: string): Promise<boolean> {
    const entry = await this.entryFor(churchId);
    return !entry.flags.money && entry.stopsGiving;
  }

  /**
   * The give link is addressed by slug and has no session to read churchId from.
   * An unknown slug is treated as closed.
   */
  async givingDoorClosedForSlug(slug: string): Promise<boolean> {
    const key = slug.trim().toLowerCase();
    const hit = this.slugs.get(key);
    let churchId: string | null;
    if (hit && Date.now() - hit.at < TTL_MS) churchId = hit.churchId;
    else {
      const church = await platformPrisma.church.findUnique({ where: { slug: key }, select: { id: true } });
      churchId = church?.id ?? null;
      this.slugs.set(key, { at: Date.now(), churchId });
    }
    if (!churchId) return true;
    return this.givingDoorClosed(churchId);
  }

  private async entryFor(churchId: string): Promise<Entry> {
    const hit = this.cache.get(churchId);
    if (hit && Date.now() - hit.at < TTL_MS) return hit;
    // Tenant-scoped read: the app role has FORCE RLS, so the church row is only
    // visible with app.church_id set — same path Settings already uses.
    const entry = await withTenant(churchId, null, async (tx) => {
      const church = await tx.church.findUnique({ where: { id: churchId }, select: { settings: true } });
      return {
        at: Date.now(),
        flags: resolveModules(church?.settings),
        stopsGiving: givingStopsWithBooks(church?.settings),
      };
    });
    this.cache.set(churchId, entry);
    return entry;
  }

  /** Called after Settings writes the switches, so the change applies at once. */
  invalidate(churchId: string) {
    this.cache.delete(churchId);
    // Slug entries point at this church; the map is small, so drop them all.
    this.slugs.clear();
  }
}

/** Global because the guard lives in the root injector and Settings writes the flags. */
@Global()
@Module({ providers: [ModuleFlagsService], exports: [ModuleFlagsService] })
export class ModuleFlagsModule {}
