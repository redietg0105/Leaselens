import { Body, Controller, Get, HttpCode, Param, Post, Res, UploadedFiles, UseInterceptors } from '@nestjs/common';
import {
  CreateWorkOrderSchema,
  SubmitAnswersSchema,
  type WorkOrderDetail,
  type WorkOrderSummary,
} from '@leaselens/shared';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators';
import { parseBody } from '../common/parse-body';
import { PhotoUploadInterceptor } from './photo-upload.interceptor';
import { WorkOrdersService } from './work-orders.service';

const MINUTE = 60 * 1000;
/** New maintenance requests per address per 10 minutes. */
export const NEW_REQUESTS_PER_WINDOW = 10;

@Controller('work-orders')
export class WorkOrdersController {
  constructor(private readonly workOrders: WorkOrdersService) {}

  /**
   * Multipart: description, entryPermission, accessNotes?, photos[] (0–3). Any unitId sent is ignored.
   * Each request costs photo processing and an AI call, so creating them is limited (per address).
   */
  @Roles('TENANT')
  @Throttle({ default: { limit: NEW_REQUESTS_PER_WINDOW, ttl: 10 * MINUTE } })
  @Post()
  @UseInterceptors(PhotoUploadInterceptor)
  async create(
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ): Promise<WorkOrderDetail> {
    const input = parseBody(CreateWorkOrderSchema, body);
    return this.workOrders.create(user, input, files ?? []);
  }

  // Declared before :id so "mine" isn't treated as an id.
  @Roles('TENANT')
  @Get('mine')
  listMine(@CurrentUser() user: AuthUser): Promise<WorkOrderSummary[]> {
    return this.workOrders.listMine(user);
  }

  @Roles('TENANT', 'COORDINATOR', 'MANAGER')
  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<WorkOrderDetail> {
    return this.workOrders.get(user, id);
  }

  /** Answers to the open follow-up questions (multiple choice). Triage then runs again. */
  @Roles('TENANT')
  @Post(':id/answers')
  @HttpCode(200)
  answers(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown): Promise<WorkOrderDetail> {
    return this.workOrders.submitAnswers(user, id, parseBody(SubmitAnswersSchema, body));
  }

  /** Tenants: own requests. Vendors: jobs dispatched to them. Coordinators/managers: any. */
  @Roles('TENANT', 'VENDOR', 'COORDINATOR', 'MANAGER')
  @Get(':id/media/:mediaId')
  async photo(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('mediaId') mediaId: string,
    @Res() res: Response,
  ) {
    const { data, contentType } = await this.workOrders.readPhoto(user, id, mediaId);
    res
      .set({
        'Content-Type': contentType,
        'Content-Disposition': 'inline',
        // Per-user content: browsers may cache briefly, shared caches must not.
        'Cache-Control': 'private, max-age=300',
      })
      .send(data);
  }
}
