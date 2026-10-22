import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { Gender, MemberStatus } from '@chms/shared';
import { RequirePermissions } from '../common/decorators';
import { AuthedRequest } from '../common/guards';
import { CreateMemberInput, MembersService } from './members.service';
import { ImportRowInput, MembersImportService } from './members-import.service';

class MemberDto implements CreateMemberInput {
  @IsOptional() @IsString() memberNo?: string;
  @IsString() @MinLength(1) firstName!: string;
  @IsString() @MinLength(1) lastName!: string;
  @IsOptional() @IsString() phoneE164?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsIn(['MALE', 'FEMALE']) gender?: Gender;
  @IsOptional() @IsString() dob?: string; // YYYY-MM-DD
  @IsOptional() @IsString() ageBracketId?: string;
  @IsOptional() @IsString() joinedAt?: string;
  @IsOptional() @IsBoolean() smsConsent?: boolean;
}

class MemberUpdateDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() phoneE164?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsIn(['MALE', 'FEMALE']) gender?: Gender;
  @IsOptional() @IsString() dob?: string;
  @IsOptional() @IsString() ageBracketId?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE', 'TRANSFERRED', 'DECEASED']) status?: MemberStatus;
  @IsOptional() @IsBoolean() smsConsent?: boolean;
}

class ImportPreviewDto {
  @IsString() csvText!: string;
}

class ImportConfirmDto {
  @IsArray() rows!: ImportRowInput[];
}

@Controller('members')
export class MembersController {
  constructor(
    private readonly members: MembersService,
    private readonly importSvc: MembersImportService,
  ) {}

  @RequirePermissions('members:read')
  @Get()
  list(
    @Req() req: AuthedRequest,
    @Query('q') q?: string,
    @Query('status') status?: MemberStatus,
    @Query('ageBracketId') ageBracketId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.members.list(req.user!, {
      q,
      status,
      ageBracketId,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @RequirePermissions('members:read')
  @Get(':id')
  getOne(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.members.getOne(req.user!, id);
  }

  @RequirePermissions('members:write')
  @Post()
  create(@Req() req: AuthedRequest, @Body() dto: MemberDto) {
    return this.members.create(req.user!, dto, req.ip);
  }

  @RequirePermissions('members:write')
  @Patch(':id')
  update(@Req() req: AuthedRequest, @Param('id') id: string, @Body() dto: MemberUpdateDto) {
    return this.members.update(req.user!, id, dto, req.ip);
  }

  @RequirePermissions('members:write')
  @Delete(':id')
  @HttpCode(200)
  remove(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.members.remove(req.user!, id, req.ip);
  }

  @RequirePermissions('members:write')
  @Post(':id/qr')
  issueQr(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.members.issueQr(req.user!, id, req.ip);
  }

  @RequirePermissions('members:import')
  @Post('import/preview')
  preview(@Req() req: AuthedRequest, @Body() dto: ImportPreviewDto) {
    return this.importSvc.preview(req.user!, dto.csvText);
  }

  @RequirePermissions('members:import')
  @Post('import/confirm')
  @HttpCode(200)
  confirm(@Req() req: AuthedRequest, @Body() dto: ImportConfirmDto) {
    return this.importSvc.confirm(req.user!, dto.rows, req.ip);
  }

  @RequirePermissions('members:read')
  @Get('meta/churn')
  churn(@Req() req: AuthedRequest, @Query('days') days?: string) {
    return this.members.churn(req.user!, days ? Number(days) : 60);
  }

  // ---- R4.8 milestones / R4.12 stages / R4.11 export ----

  @RequirePermissions('members:write')
  @Post(':id/milestones')
  milestones(@Req() req: AuthedRequest, @Param('id') id: string, @Body() dto: { salvationDate?: string | null; baptismDate?: string | null; marriageDate?: string | null; ordinationDate?: string | null }) {
    return this.members.saveMilestones(req.user!, id, dto, req.ip);
  }

  @RequirePermissions('members:write')
  @Post(':id/stage')
  setStage(@Req() req: AuthedRequest, @Param('id') id: string, @Body('stage') stage: string) {
    return this.members.setStage(req.user!, id, stage, req.ip);
  }

  @RequirePermissions('members:read')
  @Get('meta/stages')
  stageReport(@Req() req: AuthedRequest) {
    return this.members.stageReport(req.user!);
  }

  @RequirePermissions('members:read')
  @Get('meta/pastoral')
  pastoral(@Req() req: AuthedRequest, @Query('memberId') memberId?: string) {
    return this.members.pastoralActions(req.user!, { memberId });
  }

  @RequirePermissions('members:write')
  @Post('meta/pastoral')
  addPastoral(@Req() req: AuthedRequest, @Body() dto: { type: string; memberId?: string | null; actionDate: string; note?: string }) {
    return this.members.addPastoralAction(req.user!, dto, req.ip);
  }

  @RequirePermissions('members:read')
  @Get(':id/export')
  exportMember(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.members.exportMember(req.user!, id);
  }
}
