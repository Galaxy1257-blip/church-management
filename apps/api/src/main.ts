import './load-root-env'; // root .env first — cwd of npm -w is apps/api
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { loadEnv } from './env';

async function bootstrap(): Promise<void> {
  const env = loadEnv();

  // rawBody: true keeps the exact bytes for the Paystack HMAC. useBodyParser()
  // below still installs that verify hook (Nest re-reads appOptions.rawBody), so
  // the logo upload limit can be raised without breaking webhook signatures.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  app.setGlobalPrefix('api/v1');

  // Behind Render/Cloudflare, req.ip is the proxy unless we trust the nearest hop.
  // Without this every client shares one rate-limit bucket.
  if (env.NODE_ENV === 'production') app.set('trust proxy', 1);

  // Logo uploads travel as a data URL inside the JSON profile body: 100 kB
  // (body-parser default) rejected every real logo. 1 MB covers a 300 kB image
  // after base64 expansion (~400 kB) with headroom.
  app.useBodyParser('json', { limit: '1mb' });

  // CORS is an allowlist, not a mirror. The old fallback callback returned
  // `true` for every origin, so any site could read responses with a stolen
  // bearer token. `*` stays possible but only when an operator writes it in WEB_URL.
  const origins = env.WEB_URL.split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  const allowAll = origins.includes('*');
  app.enableCors({
    origin: (
      requestOrigin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // No Origin header: server-to-server, curl, native apps — no browser
      // same-origin policy to enforce, and no cookie to leak.
      if (!requestOrigin) return callback(null, true);
      const clean = requestOrigin.replace(/\/+$/, '');
      const isAllowed = allowAll || origins.includes(clean);
      if (!isAllowed) console.warn(`CORS blocked origin ${clean} (allowed: ${origins.join(', ')})`);
      callback(null, isAllowed);
    },
    // PUT is used by settings saves (church groups, SMS gateway, offering fees);
    // omitting it made those forms fail in the browser with "Failed to fetch".
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  await app.listen(env.PORT);
  console.log(`ChMS API listening on http://localhost:${env.PORT}/api/v1 (${env.NODE_ENV})`);
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap error', err);
  process.exit(1);
});
