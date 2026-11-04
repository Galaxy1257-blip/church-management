import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ForModule, RequirePermissions } from '../common/decorators';
import { AuthedRequest } from '../common/guards';
import { BatchEntryInput, FinanceService } from './finance.service';
import { ServicesService } from '../services/services.service';

class EntryDto implements BatchEntryInput {
  @IsString() fundId!: string;
  @IsInt() @Min(1) amountMinor!: number;
  @IsIn(['CASH', 'CHEQUE', 'MOBILE_MONEY']) channel!: 'CASH' | 'CHEQUE' | 'MOBILE_MONEY';
  @IsString() bankRef?: string;
  @IsString() giverName?: string;
}

class CreateBatchDto {
  @IsString() serviceId!: string;
  @IsString() label!: string;
}

class EntriesDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => EntryDto)
  entries!: EntryDto[];
}

class CountDto {
  @IsInt() @Min(0) countedMinor!: number;
}

class DepositDto {
  @IsString() depositRef!: string;
}

// Switched off in Settings → App sections means switched off here too.
@ForModule('money')
@Controller('finance')
export class FinanceController {
  constructor(private readonly finance: FinanceService, private readonly services: ServicesService) {}

  /**
   * The service an usher is counting for. It reads through ServicesService so the
   * Sunday-morning auto-open still runs, and it does not depend on the Services
   * section being switched on (the door still counts when that screen is hidden).
   */
  @RequirePermissions('collection:write')
  @Get('collection-service')
  async collectionService(@Req() req: AuthedRequest) {
    const list = await this.services.list(req.user!);
    const current = list.find((s) => s.status === 'OPEN') ?? list[0] ?? null;
    return current ? { id: current.id, name: current.name, startsAt: current.startsAt, status: current.status } : null;
  }

  @RequirePermissions('finance:read')
  @Get('batches')
  batches(@Req() req: AuthedRequest) {
    return this.finance.listBatches(req.user!);
  }

  /** The door team's amount only — no sheet, no fund list, no reports. */
  @RequirePermissions('collection:write')
  @Post('collection')
  recordCollection(@Req() req: AuthedRequest, @Body() body: { serviceId: string; amountMinor: number; note?: string }) {
    return this.finance.recordCollection(req.user!, body, req.ip);
  }

  @RequirePermissions('finance:read')
  @Post('batches')
  create(@Req() req: AuthedRequest, @Body() dto: CreateBatchDto) {
    return this.finance.createBatch(req.user!, dto, req.ip);
  }

  @RequirePermissions('finance:read')
  @Post('batches/:id/entries')
  @HttpCode(200)
  entries(@Req() req: AuthedRequest, @Param('id') id: string, @Body() dto: EntriesDto) {
    return this.finance.addEntries(req.user!, id, dto.entries, req.ip);
  }

  @RequirePermissions('finance:read')
  @Post('batches/:id/count')
  @HttpCode(200)
  count(@Req() req: AuthedRequest, @Param('id') id: string, @Body() dto: CountDto) {
    return this.finance.recordCount(req.user!, id, dto.countedMinor, req.ip);
  }

  @RequirePermissions('finance:approve')
  @Post('batches/:id/approve')
  @HttpCode(200)
  approve(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.finance.approve(req.user!, id, req.ip);
  }

  @RequirePermissions('finance:approve')
  @Post('batches/:id/deposit')
  @HttpCode(200)
  deposit(@Req() req: AuthedRequest, @Param('id') id: string, @Body() dto: DepositDto) {
    return this.finance.deposit(req.user!, id, dto.depositRef, req.ip);
  }

  @RequirePermissions('reports:read')
  @Get('reports/by-fund')
  byFund(@Req() req: AuthedRequest, @Query('from') from?: string, @Query('to') to?: string) {
    return this.finance.byFund(req.user!, from, to);
  }

  @RequirePermissions('reports:read')
  @Get('reports/by-sunday')
  bySunday(@Req() req: AuthedRequest, @Query('from') from?: string, @Query('to') to?: string) {
    return this.finance.bySunday(req.user!, from, to);
  }

  @RequirePermissions('reports:read')
  @Get('reports/analytics')
  analytics(@Req() req: AuthedRequest, @Query('days') days?: string) {
    return this.finance.analytics(req.user!, days ? Number(days) : 90);
  }
}
