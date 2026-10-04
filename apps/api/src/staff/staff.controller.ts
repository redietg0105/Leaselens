import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  DispatchRequestSchema,
  OverrideSchema,
  QueueFilterSchema,
  type QueueItem,
  type StaffWorkOrder,
  type VendorMatch,
} from '@leaselens/shared';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators';
import { parseBody } from '../common/parse-body';
import { DispatchService } from '../dispatch/dispatch.service';
import { StaffService } from './staff.service';

/** Triage queue, overrides and dispatch — coordinators and managers only. */
@Roles('COORDINATOR', 'MANAGER')
@Controller()
export class StaffController {
  constructor(
    private readonly staff: StaffService,
    private readonly dispatch: DispatchService,
  ) {}

  @Get('staff/queue')
  queue(@Query() query: unknown): Promise<QueueItem[]> {
    return this.staff.queue(parseBody(QueueFilterSchema, query, 'Unknown filter.'));
  }

  @Get('staff/work-orders/:id')
  get(@Param('id') id: string): Promise<StaffWorkOrder> {
    return this.staff.get(id);
  }

  /** Any overriddenBy / actor field in the body is ignored — the session user is recorded. */
  @Post('work-orders/:id/override')
  @HttpCode(200)
  async override(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown): Promise<StaffWorkOrder> {
    await this.staff.override(user, id, parseBody(OverrideSchema, body));
    return this.staff.get(id);
  }

  @Get('work-orders/:id/vendors')
  vendors(@Param('id') id: string): Promise<VendorMatch[]> {
    return this.dispatch.matchesFor(id);
  }

  /** Any approvedBy field in the body is ignored — the session user is the approver. */
  @Post('work-orders/:id/dispatch')
  @HttpCode(200)
  async approve(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown): Promise<StaffWorkOrder> {
    await this.dispatch.approve(user, id, parseBody(DispatchRequestSchema, body).vendorId);
    return this.staff.get(id);
  }
}
