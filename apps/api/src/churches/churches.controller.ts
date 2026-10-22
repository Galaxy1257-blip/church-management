import { Body, Controller, Get, Headers, Module, NotFoundException, Param, Post, Req } from '@nestjs/common';
import { IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Public, RequirePermissions } from '../common/decorators';
import { AuthedRequest } from '../common/guards';
import { ChurchesService } from './churches.service';

class AdminDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() phoneE164!: string;
  @IsString() @MinLength(8) password!: string;
}

class CreateChurchDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(2) slug!: string;
  @IsOptional() @IsString() pastorDisplayName?: string;
  @IsOptional() @IsString() timezone?: string;
  @ValidateNested() @Type(() => AdminDto) admin!: AdminDto;
}

@Controller('churches')
export class ChurchesController {
  constructor(private readonly churches: ChurchesService) {}

  @Public()
  @Post()
  create(@Body() dto: CreateChurchDto, @Headers('x-platform-key') platformKey = '') {
    return this.churches.create({ ...dto, platformKey });
  }

  @Public()
  @Get(':slug')
  async publicBySlug(@Param('slug') slug: string) {
    const c = await this.churches.getPublicBySlug(slug);
    if (!c) throw new NotFoundException('church not found');
    return c;
  }

  @RequirePermissions('settings:write')
  @Get('me/settings')
  settings(@Req() req: AuthedRequest) {
    return this.churches.getSettings(req.user!.churchId);
  }

  @RequirePermissions('church:read')
  @Get('me/devotional')
  devotional(@Req() req: AuthedRequest) {
    return this.churches.devotional(req.user!.churchId);
  }

  @RequirePermissions('settings:write')
  @Post('me/devotional')
  saveDevotional(
    @Req() req: AuthedRequest,
    @Body() body: { enabled?: boolean; translation?: string; verse?: string },
  ) {
    return this.churches.saveDevotional(req.user!, body, req.ip);
  }

  @RequirePermissions('settings:write')
  @Get('me/profile')
  profile(@Req() req: AuthedRequest) {
    return this.churches.getProfile(req.user!.churchId);
  }

  @RequirePermissions('settings:write')
  @Post('me/profile')
  saveProfile(@Req() req: AuthedRequest, @Body() body: any) {
    return this.churches.saveProfile(req.user!, body, req.ip);
  }

  @RequirePermissions('church:read')
  @Get('me/terminology')
  terminology(@Req() req: AuthedRequest) {
    return this.churches.terminology(req.user!.churchId);
  }
}

@Module({
  providers: [ChurchesService],
  controllers: [ChurchesController],
  exports: [ChurchesService],
})
export class ChurchesModule {}
