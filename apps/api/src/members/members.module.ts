import { Module } from '@nestjs/common';
import { TenantService } from '../common/tenant';
import { MembersService } from './members.service';
import { MembersImportService } from './members-import.service';
import { MembersController } from './members.controller';

@Module({
  providers: [TenantService, MembersService, MembersImportService],
  controllers: [MembersController],
  exports: [MembersService],
})
export class MembersModule {}
