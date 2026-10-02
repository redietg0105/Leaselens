import { Body, Controller, Get, Param, Post, Res, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { CreateWorkOrderSchema, type WorkOrderDetail, type WorkOrderSummary } from '@leaselens/shared';
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators';
import { parseBody } from '../common/parse-body';
import { PhotoUploadInterceptor } from './photo-upload.interceptor';
import { WorkOrdersService } from './work-orders.service';

@Controller('work-orders')
export class WorkOrdersController {
  constructor(private readonly workOrders: WorkOrdersService) {}

  /** Multipart: description, entryPermission, accessNotes?, photos[] (0–3). Any unitId sent is ignored. */
  @Roles('TENANT')
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

  @Roles('TENANT', 'COORDINATOR', 'MANAGER')
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
