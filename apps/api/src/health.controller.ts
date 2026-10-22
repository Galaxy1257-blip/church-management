import { Controller, Get } from '@nestjs/common';
import { Public } from './common/decorators';
import { prisma } from '@chms/db';

@Controller()
export class HealthController {
  @Public()
  @Get()
  async root() {
    return {
      status: 'online',
      message: 'ChMS API is running successfully',
      version: '1.0.0',
      health: '/api/v1/health',
    };
  }

  @Public()
  @Get('health')
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
