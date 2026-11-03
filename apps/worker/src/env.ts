import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(16),
  SMS_GATEWAY: z.enum(['mock', 'csms']).default('mock'),
  CSMS_BASE_URL: z.string().default(''),
  CSMS_USERNAME: z.string().default(''),
  CSMS_PASSWORD: z.string().default(''),
  CSMS_SENDER_ID: z.string().default(''),
  PAYSTACK_MODE: z.enum(['mock', 'live']).default('mock'),
  PAYSTACK_SECRET_KEY: z.string().default(''),
  PAYSTACK_BASE_URL: z.string().default('https://api.paystack.co'),
  WEB_URL: z.string().default('http://localhost:3000'),
  // The tick URL is dead unless this is set — tick-server refuses to run any
  // job without it, so a service created without the secret cannot send SMS.
  JOBS_TICK_TOKEN: z.string().default(''),
  PORT: z.coerce.number().int().positive().default(10000),
});

export type WorkerEnv = z.infer<typeof envSchema>;

export function loadWorkerEnv(source: NodeJS.ProcessEnv = process.env): WorkerEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid worker environment: ${issues}`);
  }
  return parsed.data;
}
