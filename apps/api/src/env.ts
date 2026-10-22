import { z } from 'zod';

/** Parse "15m", "30d", "45s", "2h" into seconds. */
export function parseTtl(value: string): number {
  const m = /^(\d+)([smhd])$/.exec(value.trim());
  if (!m) throw new Error(`invalid TTL "${value}" (expected e.g. 15m, 30d)`);
  const n = Number(m[1]);
  const mult = { s: 1, m: 60, h: 3600, d: 86400 }[m[2] as 's' | 'm' | 'h' | 'd'];
  return n * mult;
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('30d'),
  PLATFORM_SIGNUP_KEY: z.string().default('dev-platform-signup-key'),
  PAYSTACK_MODE: z.enum(['mock', 'live']).default('mock'),
  PAYSTACK_SECRET_KEY: z.string().default(''),
  PAYSTACK_PUBLIC_KEY: z.string().default(''),
  PAYSTACK_BASE_URL: z.string().default('https://api.paystack.co'),
  SMS_WEBHOOK_SECRET: z.string().default('dev-sms-webhook-secret'),
  WEB_URL: z.string().default('http://localhost:3000'),
  API_URL: z.string().default('http://localhost:4000'),
});

export type Env = z.infer<typeof envSchema> & {
  ACCESS_TOKEN_TTL_SEC: number;
  REFRESH_TOKEN_TTL_SEC: number;
};

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  return {
    ...parsed.data,
    ACCESS_TOKEN_TTL_SEC: parseTtl(parsed.data.ACCESS_TOKEN_TTL),
    REFRESH_TOKEN_TTL_SEC: parseTtl(parsed.data.REFRESH_TOKEN_TTL),
  };
}
