import { Body, Controller, Get, HttpCode, Post, Query, Req } from '@nestjs/common';
import { IsArray, IsInt, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Public, RequirePermissions } from '../common/decorators';
import { AuthedRequest } from '../common/guards';
import { HeadcountService, SyncEvent } from './headcount.service';

class SyncEventDto implements SyncEvent {
  @IsString() id!: string;
  @IsString() serviceId!: string;
  @IsString() segmentKey!: string;
  @IsInt() @Min(-1) delta!: number;
  @IsString() deviceId!: string;
  @IsInt() clientSeq!: number;
  @IsString() recordedAt!: string;
}

class SyncBatchDto {
  @IsString() deviceId!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => SyncEventDto) events!: SyncEventDto[];
}

@Controller()
export class HeadcountController {
  constructor(private readonly headcount: HeadcountService) {}

  /** Offline-first replay endpoint — idempotent by client event id. */
  @RequirePermissions('headcount:write')
  @Post('sync/batch')
  @HttpCode(200)
  sync(@Req() req: AuthedRequest, @Body() dto: SyncBatchDto) {
    return this.headcount.syncBatch(req.user!, dto.deviceId, dto.events, req.ip);
  }

  @RequirePermissions('services:read')
  @Get('headcount/totals')
  totals(@Req() req: AuthedRequest, @Query('serviceId') serviceId: string) {
    return this.headcount.totals(req.user!, serviceId);
  }

  @RequirePermissions('services:read')
  @Get('headcount/recent')
  recent(@Req() req: AuthedRequest, @Query('serviceId') serviceId: string, @Query('limit') limit?: string) {
    return this.headcount.recent(req.user!, serviceId, limit ? Number(limit) : undefined);
  }

  /**
   * SSE live feed for the media/projection screen. Public by design (screen
   * devices have no session); the serviceId must resolve to a real service.
   */
  @Public()
  @Get('headcount/stream')
  async stream(@Query('serviceId') serviceId: string, @Req() req: any) {
    const resObj = req.res;
    resObj.setHeader('Content-Type', 'text/event-stream');
    resObj.setHeader('Cache-Control', 'no-cache');
    resObj.setHeader('Connection', 'keep-alive');
    resObj.flushHeaders?.();

    const send = (data: unknown) => resObj.write(`data: ${JSON.stringify(data)}\n\n`);
    const { platformPrisma } = await import('@chms/db');
    let stop = false;
    req.on?.('close', () => {
      stop = true;
    });
    while (!stop) {
      const svc = await platformPrisma.service.findUnique({ where: { id: serviceId } });
      if (!svc) {
        send({ error: 'unknown service' });
        break;
      }
      const totals = await this.headcount.totalsPlatform(svc.churchId, serviceId);
      send({ serviceId, ...totals, at: new Date().toISOString() });
      await new Promise((r) => setTimeout(r, 5000));
      if (resObj.writableEnded) break;
    }
    resObj.end();
    return undefined as never;
  }
}
