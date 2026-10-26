// Boot check (BUILD_ORDER Phase 0): fail fast at startup when any HTTP route
// declares neither @RequirePermissions nor @Public() — default deny is a
// deployment gate, not a runtime suggestion.
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { MetadataScanner } from '@nestjs/core/metadata-scanner';
import { ModulesContainer } from '@nestjs/core';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { PUBLIC_KEY, PERMISSIONS_KEY, AUTHENTICATED_KEY } from './decorators';

interface RouteViolation {
  controller: string;
  method: string;
}

@Injectable()
export class BootCheckService implements OnApplicationBootstrap {
  private readonly logger = new Logger('BootCheck');
  private readonly scanner = new MetadataScanner();

  constructor(private readonly modules: ModulesContainer) {}

  onApplicationBootstrap(): void {
    const violations = this.scan();
    if (violations.length > 0) {
      for (const v of violations) {
        this.logger.error(`MISSING PERMISSION DECORATOR: ${v.controller}.${v.method}`);
      }
      this.logger.error(
        `Default-deny boot check failed: ${violations.length} route(s) lack @RequirePermissions, @Authenticated() or @Public(). Refusing to start.`,
      );
      process.exit(1);
    }
    this.logger.log('Default-deny boot check passed: every HTTP route declares its access policy.');
  }

  /** Returns violations (public + permissions metadata both missing). */
  scan(): RouteViolation[] {
    const violations: RouteViolation[] = [];
    for (const moduleRef of this.modules.values()) {
      const controllers = moduleRef.controllers ?? [];
      for (const wrapper of controllers.values()) {
        const { instance, metatype } = wrapper;
        if (!instance || !metatype) continue;
        const prototype = Object.getPrototypeOf(instance) as object;
        if (!prototype) continue;
        for (const methodName of this.scanner.getAllMethodNames(prototype)) {
          const handler = (prototype as any)[methodName];
          if (typeof handler !== 'function') continue;
          const path = Reflect.getMetadata(PATH_METADATA, handler);
          const method = Reflect.getMetadata(METHOD_METADATA, handler);
          if (path === undefined || method === undefined) continue; // not an HTTP handler
          const isPublic = Reflect.getMetadata(PUBLIC_KEY, handler) === true;
          const isAuthenticatedOnly = Reflect.getMetadata(AUTHENTICATED_KEY, handler) === true;
          const perms = Reflect.getMetadata(PERMISSIONS_KEY, handler);
          if (!isPublic && !isAuthenticatedOnly && (!perms || (perms as unknown[]).length === 0)) {
            violations.push({ controller: metatype.name, method: methodName });
          }
        }
      }
    }
    return violations;
  }
}

export const BOOT_CHECK_IGNORE = MODULE_METADATA; // keep import used (tree-shaking safety)
