import { Controller, Get } from '@nestjs/common';
import { Public } from './common/decorators';
import { prisma } from '@chms/db';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  async health() {
    let db: 'up' | 'down' = 'down';
    try {
      await prisma.$queryRaw`SELECT 1`;
      db = 'up';
    } catch {
      db = 'down';
    }
    return { ok: db === 'up', db, ts: new Date().toISOString() };
  }
}
