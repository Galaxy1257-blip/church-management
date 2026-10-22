import { Global, Module } from '@nestjs/common';
import { loadEnv } from './env';

/**
 * Global env provider. Feature modules inject the parsed, validated config
 * via @Inject('ENV'). loadEnv() throws on boot if anything required is
 * missing — fail fast, not at first request.
 */
@Global()
@Module({
  providers: [{ provide: 'ENV', useFactory: loadEnv }],
  exports: ['ENV'],
})
export class EnvModule {}

export const ENV_TOKEN = 'ENV';
