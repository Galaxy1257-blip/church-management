// In-process rate limiting for the unauthenticated auth surface.
//
// Why not @nestjs/throttler: this deployment is a single API instance, and the
// only buckets needed are per-route with a body field in the key (a fixed window
// is fine for "stop password guessing" / "stop SMS draining"). 60 lines here vs a
// new dependency. If the API is ever scaled horizontally, replace `take()` with a
// Redis INCR + EXPIRE — the call sites do not change.
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

export interface RateLimitOptions {
  /** Requests allowed per window. */
  limit: number;
  windowMs: number;
  /** Also bucket by the phone in the JSON body (OTP/SMS cost is per phone). */
  byPhone?: boolean;
  /** Override the bucket name (defaults to method + route). */
  key?: string;
}

export const RATE_LIMIT_KEY = 'chms:rate-limit';

/**
 * Declare one or more buckets for a route. Several buckets are AND-ed, which is
 * how a per-phone cost cap (3 OTPs/hour for this number) coexists with a
 * per-IP abuse cap (10/hour for this attacker rotating numbers).
 */
export const RateLimit = (options: RateLimitOptions | RateLimitOptions[]) =>
  SetMetadata(RATE_LIMIT_KEY, Array.isArray(options) ? options : [options]);

interface Counter {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Counter>();
const MAX_KEYS = 20_000;

function sweep(now: number): void {
  for (const [key, counter] of buckets) if (counter.resetAt <= now) buckets.delete(key);
}

/** Count one hit against a bucket. Exported so tests can drive it directly. */
export function take(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  if (buckets.size > MAX_KEYS) sweep(now);
  let counter = buckets.get(key);
  if (!counter || counter.resetAt <= now) {
    counter = { count: 0, resetAt: now + windowMs };
    buckets.set(key, counter);
  }
  counter.count += 1;
  return {
    allowed: counter.count <= limit,
    retryAfterSec: Math.max(1, Math.ceil((counter.resetAt - now) / 1000)),
  };
}

/** Test hook: forget every bucket. */
export function resetRateLimits(): void {
  buckets.clear();
}

/** Applies the `@RateLimit(...)` metadata on the handler or its controller. */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions[] | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options || options.length === 0) return true;

    // Guards run after body-parser middleware, so req.body is already populated
    // (it is not validated yet — a string check is all the bucket key needs).
    const req = context.switchToHttp().getRequest<Request & { body?: Record<string, unknown> }>();
    const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    const phone = typeof req.body?.phoneE164 === 'string' ? String(req.body.phoneE164) : '';
    const route = req.route?.path ?? req.originalUrl.split('?')[0];

    for (const option of options) {
      const identity = option.byPhone ? `${ip}:${phone}` : ip;
      const { allowed, retryAfterSec } = take(
        `${option.key ?? `${req.method} ${route}`}:${identity}`,
        option.limit,
        option.windowMs,
      );
      if (!allowed) {
        throw new HttpException(`too many requests — retry in ${retryAfterSec}s`, HttpStatus.TOO_MANY_REQUESTS);
      }
    }
    return true;
  }
}
