import './load-root-env'; // root .env first — cwd of npm -w is apps/api
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { loadEnv } from './env';

async function bootstrap(): Promise<void> {
  const env = loadEnv();

  const app = await NestFactory.create(AppModule, {
    rawBody: true, // paystack webhook needs the exact bytes for HMAC
  });

  app.setGlobalPrefix('api/v1');
  // origin may be comma-separated (e.g. localhost + a demo tunnel URL)
  const origins = env.WEB_URL.split(',').map((s) => s.trim()).filter(Boolean);
  app.enableCors({ origin: origins.length > 1 ? origins : origins[0], methods: ['GET', 'POST', 'PATCH', 'DELETE'] });
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
