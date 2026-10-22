// Follow-up workflow admin (drip builder backend): list, create draft with
// steps, publish a version (engine pins enrolments to published versions).
import { Body, Controller, Get, Injectable, Module, Param, Post, Req } from '@nestjs/common';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Min, MinLength, ValidateNested } from 'class-validator';
import { appendAudit } from '@chms/db';
import { RequirePermissions } from '../common/decorators';
import { AuthedRequest, AuthUser } from '../common/guards';
import { TenantService } from '../common/tenant';

class StepDto {
  @IsInt() @Min(0) position!: number;
  @IsIn(['SMS', 'TASK', 'PROMPT']) type!: 'SMS' | 'TASK' | 'PROMPT';
  @IsInt() @Min(0) delayMinutes!: number;
  @IsString() @MinLength(1) template!: string;
  @IsOptional() @IsString() taskTitle?: string;
  @IsOptional() @IsString() question?: string;
}

class WorkflowDto {
  @IsString() @MinLength(1) name!: string;
  @IsIn(['VISITOR_REGISTERED', 'MEMBER_ABSENT', 'NEW_MEMBER', 'MANUAL']) trigger!: string;
  @IsArray() @ValidateNested({ each: true }) steps!: StepDto[];
  @IsOptional() @IsBoolean() publish?: boolean;
}

@Injectable()
export class FollowupAdminService {
  constructor(private readonly tenant: TenantService) {}

  list(user: AuthUser) {
    return this.tenant.run(user, (tx) =>
      tx.followUpWorkflow.findMany({
        where: { churchId: user.churchId },
        include: { versions: { include: { steps: { orderBy: { position: 'asc' } } }, orderBy: { version: 'desc' } } },
      }),
    );
  }

  create(user: AuthUser, input: WorkflowDto, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const wf = await tx.followUpWorkflow.create({
        data: { churchId: user.churchId, name: input.name, trigger: input.trigger as never, isActive: true },
      });
      const version = await tx.followUpWorkflowVersion.create({
        data: { workflowId: wf.id, version: 1, isPublished: input.publish === true, createdBy: user.userId },
      });
      for (const s of input.steps) {
        await tx.followUpStep.create({
          data: {
            versionId: version.id,
            position: s.position,
            type: s.type,
            delayFrom: 'ENROLLMENT',
            delayMinutes: s.delayMinutes,
            template: s.template,
            taskTitle: s.taskTitle ?? null,
            question: s.question ?? null,
          },
        });
      }
      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: 'followup.workflow.create',
        entity: 'FollowUpWorkflow',
        entityId: wf.id,
        after: { name: input.name, steps: input.steps.length, published: input.publish === true },
        ip,
      });
      return wf;
    });
  }

  publish(user: AuthUser, workflowId: string, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const wf = await tx.followUpWorkflow.findFirst({ where: { id: workflowId, churchId: user.churchId } });
      if (!wf) throw new Error('workflow not found');
      const draft = await tx.followUpWorkflowVersion.findFirst({
        where: { workflowId, isPublished: false },
        orderBy: { version: 'desc' },
      });
      if (!draft) throw new Error('no unpublished version');
      await tx.followUpWorkflowVersion.update({ where: { id: draft.id }, data: { isPublished: true } });
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: 'followup.workflow.publish', entity: 'FollowUpWorkflowVersion', entityId: draft.id, ip });
      return { published: draft.version };
    });
  }
}

@Controller('followup')
export class FollowupAdminController {
  constructor(private readonly svc: FollowupAdminService) {}

  @RequirePermissions('campaigns:read')
  @Get('workflows')
  list(@Req() req: AuthedRequest) {
    return this.svc.list(req.user!);
  }

  @RequirePermissions('campaigns:write')
  @Post('workflows')
  create(@Req() req: AuthedRequest, @Body() dto: WorkflowDto) {
    return this.svc.create(req.user!, dto, req.ip);
  }

  @RequirePermissions('campaigns:write')
  @Post('workflows/:id/publish')
  publish(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.svc.publish(req.user!, id, req.ip);
  }
}

@Module({
  providers: [TenantService, FollowupAdminService],
  controllers: [FollowupAdminController],
})
export class FollowupAdminModule {}
