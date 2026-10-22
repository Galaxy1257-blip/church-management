import { Body, Controller, Get, Module, Post, Put, Req } from '@nestjs/common';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { RequirePermissions } from '../common/decorators';
import { AuthedRequest } from '../common/guards';
import { TenantService } from '../common/tenant';
import { BracketInput, DemographicsService } from './demographics.service';

class BracketDto implements BracketInput {
  @IsString() @MinLength(1) key!: string;
  @IsString() @MinLength(1) label!: string;
  @IsInt() @Min(0) minAge!: number;
  @IsOptional() @IsInt() @Min(0) maxAge?: number | null;
  @IsOptional() @IsBoolean() genderSplit?: boolean;
  @IsString() @MinLength(1) segmentKey!: string;
  @IsOptional() @IsString() ministryNote?: string;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class BracketsDto {
  @IsArray() brackets!: BracketDto[];
}

class SettingsDto {
  @IsOptional() @IsBoolean() autoAssignHeadcount?: boolean;
  @IsOptional() @IsBoolean() autoPromote?: boolean;
  @IsOptional() @IsInt() @Min(0) capacity?: number;
}

@Controller('demographics')
export class DemographicsController {
  constructor(private readonly svc: DemographicsService) {}

  @RequirePermissions('church:read')
  @Get('brackets')
  brackets(@Req() req: AuthedRequest) {
    return this.svc.brackets(req.user!);
  }

  @RequirePermissions('settings:write')
  @Put('brackets')
  saveBrackets(@Req() req: AuthedRequest, @Body() dto: BracketsDto) {
    return this.svc.saveBrackets(req.user!, dto.brackets, req.ip);
  }

  @RequirePermissions('church:read')
  @Get('settings')
  settings(@Req() req: AuthedRequest) {
    return this.svc.settings(req.user!);
  }

  @RequirePermissions('settings:write')
  @Put('settings')
  saveSettings(@Req() req: AuthedRequest, @Body() dto: SettingsDto) {
    return this.svc.saveSettings(
      req.user!,
      {
        autoAssignHeadcount: dto.autoAssignHeadcount ?? true,
        autoPromote: dto.autoPromote ?? false,
        capacity: dto.capacity ?? 0,
      },
      req.ip,
    );
  }

  @RequirePermissions('members:read')
  @Get('counts')
  counts(@Req() req: AuthedRequest) {
    return this.svc.counts(req.user!);
  }

  @RequirePermissions('members:write')
  @Post('promotions/run')
  runPromotions(@Req() req: AuthedRequest, @Body() body: { apply?: boolean }) {
    return this.svc.runPromotions(req.user!, body?.apply !== false, req.ip);
  }
}

@Module({
  providers: [TenantService, DemographicsService],
  controllers: [DemographicsController],
  exports: [DemographicsService],
})
export class DemographicsModule {}
