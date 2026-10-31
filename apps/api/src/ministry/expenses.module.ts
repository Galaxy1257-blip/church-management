// Expense ledger with approval workflow (deacon/board flow).
import { Body, Controller, Get, Injectable, Module, Param, Post, Query, Req } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { appendAudit } from '@chms/db';
import { RequirePermissions } from '../common/decorators';
import { AuthedRequest, AuthUser } from '../common/guards';
import { TenantService } from '../common/tenant';

class ExpenseDto {
  @IsString() categoryId!: string;
  @IsInt() @Min(1) amountMinor!: number;
  @IsString() spentOn!: string;
  @IsString() @MinLength(1) payee!: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsString() receiptKey?: string;
}

@Injectable()
export class ExpensesService {
  constructor(private readonly tenant: TenantService) {}

  categories(user: AuthUser) {
    return this.tenant.run(user, (tx) => tx.expenseCategory.findMany({ where: { churchId: user.churchId } }));
  }

  list(user: AuthUser) {
    return this.tenant.run(user, (tx) =>
      tx.expense.findMany({
        where: { churchId: user.churchId },
        include: { category: { select: { name: true } } },
        orderBy: { spentOn: 'desc' },
        take: 200,
      }),
    );
  }

  create(user: AuthUser, input: ExpenseDto, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const e = await tx.expense.create({
        data: {
          churchId: user.churchId,
          categoryId: input.categoryId,
          amountMinor: input.amountMinor,
          spentOn: new Date(input.spentOn),
          payee: input.payee,
          note: input.note ?? null,
          receiptKey: input.receiptKey ?? null,
          status: 'SUBMITTED',
          submittedBy: user.userId,
        },
      });
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: 'expense.create', entity: 'Expense', entityId: e.id, after: e, ip });
      return e;
    });
  }

  decide(user: AuthUser, id: string, approve: boolean, ip?: string) {
    return this.tenant.run(user, async (tx) => {
      const e = await tx.expense.findFirst({ where: { id, churchId: user.churchId } });
      if (!e) throw new Error('expense not found');
      if (e.submittedBy === user.userId) throw new Error('submitter cannot approve their own expense');
      const updated = await tx.expense.update({
        where: { id },
        data: { status: approve ? 'APPROVED' : 'REJECTED', approvedBy: user.userId },
      });
      await appendAudit(tx, { churchId: user.churchId, actorId: user.userId, action: approve ? 'expense.approve' : 'expense.reject', entity: 'Expense', entityId: id, before: { status: e.status }, after: { status: updated.status, amountMinor: e.amountMinor }, ip });
      return updated;
    });
  }

  /**
   * One month, totalled. The ledger above is capped at 200 rows, so the monthly
   * figures a treasurer reads out (or sends on WhatsApp) have to come from a
   * query instead of being added up in the browser from a truncated list.
   */
  async summary(user: AuthUser, month?: string) {
    const now = new Date();
    const wanted = /^\d{4}-\d{2}$/.test(month ?? '') ? (month as string) : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [year, mm] = wanted.split('-').map(Number);
    const from = new Date(Date.UTC(year, mm - 1, 1));
    const to = new Date(Date.UTC(year, mm, 1));

    const rows = await this.tenant.run(user, (tx) =>
      tx.expense.findMany({
        where: { churchId: user.churchId, spentOn: { gte: from, lt: to } },
        include: { category: { select: { name: true } } },
        orderBy: { spentOn: 'asc' },
      }),
    );

    const byCategory = new Map<string, { name: string; approvedMinor: number; pendingMinor: number; count: number }>();
    let approvedMinor = 0;
    let pendingMinor = 0;
    const approved: typeof rows = [];
    for (const row of rows) {
      const bucket = byCategory.get(row.categoryId) ?? { name: row.category.name, approvedMinor: 0, pendingMinor: 0, count: 0 };
      bucket.count += 1;
      if (row.status === 'APPROVED') {
        bucket.approvedMinor += row.amountMinor;
        approvedMinor += row.amountMinor;
        approved.push(row);
      } else if (row.status === 'SUBMITTED') {
        bucket.pendingMinor += row.amountMinor;
        pendingMinor += row.amountMinor;
      }
      byCategory.set(row.categoryId, bucket);
    }

    const label = from.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return {
      month: wanted,
      label,
      approvedMinor,
      pendingMinor,
      categories: [...byCategory.values()].sort((a, b) => b.approvedMinor - a.approvedMinor),
      items: approved.map((row) => ({
        spentOn: row.spentOn.toISOString(),
        category: row.category.name,
        payee: row.payee,
        amountMinor: row.amountMinor,
        note: row.note,
      })),
    };
  }
}

@Controller('expenses')
export class ExpensesController {
  constructor(private readonly svc: ExpensesService) {}

  @RequirePermissions('expenses:read')
  @Get()
  list(@Req() req: AuthedRequest) {
    return this.svc.list(req.user!);
  }

  @RequirePermissions('expenses:read')
  @Get('summary')
  summary(@Req() req: AuthedRequest, @Query('month') month?: string) {
    return this.svc.summary(req.user!, month);
  }

  @RequirePermissions('expenses:read')
  @Get('categories')
  categories(@Req() req: AuthedRequest) {
    return this.svc.categories(req.user!);
  }

  @RequirePermissions('expenses:write')
  @Post()
  create(@Req() req: AuthedRequest, @Body() dto: ExpenseDto) {
    return this.svc.create(req.user!, dto, req.ip);
  }

  @RequirePermissions('expenses:approve')
  @Post(':id/decide')
  decide(@Req() req: AuthedRequest, @Param('id') id: string, @Body('approve') approve: boolean) {
    return this.svc.decide(req.user!, id, approve !== false, req.ip);
  }
}

@Module({
  providers: [TenantService, ExpensesService],
  controllers: [ExpensesController],
})
export class ExpensesModule {}
