import { Body, Controller, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { RequirePermissions } from '../common/decorators';
import { AuthedRequest } from '../common/guards';
import { ServicesService } from './services.service';

class CreateServiceDto {
  @IsString() @MinLength(1) name!: string;
  @IsString() startsAt!: string; // ISO timestamp
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() templateId?: string;
}

class SaveScheduleDto {
  @IsBoolean() enabled!: boolean;
  @IsInt() @Min(0) @Max(6) weekday!: number;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime!: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endTime!: string;
  @IsString() @MinLength(1) @MaxLength(60) name!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) skipDates?: string[];
}

@Controller('services')
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @RequirePermissions('services:read')
  @Get()
  list(@Req() req: AuthedRequest, @Query('from') from?: string, @Query('to') to?: string) {
    return this.services.list(req.user!, { from, to });
  }

  @RequirePermissions('services:read')
  @Get('templates')
  templates(@Req() req: AuthedRequest) {
    return this.services.templates(req.user!);
  }

  @RequirePermissions('services:read')
  @Get('schedule')
  schedule(@Req() req: AuthedRequest) {
    return this.services.schedule(req.user!);
  }

  @RequirePermissions('services:write')
  @Put('schedule')
  saveSchedule(@Req() req: AuthedRequest, @Body() dto: SaveScheduleDto) {
    return this.services.saveSchedule(
      req.user!,
      {
        enabled: dto.enabled,
        weekday: dto.weekday,
        startTime: dto.startTime,
        endTime: dto.endTime,
        name: dto.name,
        skipDates: dto.skipDates,
      },
      req.ip,
    );
  }

  @RequirePermissions('services:read')
  @Get(':id')
  getOne(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.services.getOne(req.user!, id);
  }

  @RequirePermissions('services:write')
  @Post()
  create(@Req() req: AuthedRequest, @Body() dto: CreateServiceDto) {
    return this.services.create(
      req.user!,
      { name: dto.name, startsAt: dto.startsAt, branchId: dto.branchId, templateId: dto.templateId },
      req.ip,
    );
  }

  @RequirePermissions('services:write')
  @Post(':id/open')
  open(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.services.setStatus(req.user!, id, 'OPEN', req.ip);
  }

  @RequirePermissions('services:write')
  @Post(':id/close')
  close(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.services.setStatus(req.user!, id, 'CLOSED', req.ip);
  }
}
