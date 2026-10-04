import { Body, Controller, Get, HttpCode, Param, Post, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { CompleteJobSchema, type VendorJob, type VendorJobSummary } from '@leaselens/shared';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser, Roles } from '../auth/decorators';
import { parseBody } from '../common/parse-body';
import { DispatchService } from '../dispatch/dispatch.service';
import { PhotoUpload } from '../work-orders/photo-upload.interceptor';

/** The vendor job pages. Every route checks that the job belongs to the signed-in vendor. */
@Roles('VENDOR')
@Controller('vendor/jobs')
export class VendorController {
  constructor(private readonly dispatch: DispatchService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<VendorJobSummary[]> {
    return this.dispatch.listJobs(user);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<VendorJob> {
    return this.dispatch.getJob(user, id);
  }

  /** Multipart: note, optional "photo" (1, same rules as tenant photos). */
  @Post(':id/complete')
  @HttpCode(200)
  @UseInterceptors(PhotoUpload('photo', 1))
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ): Promise<VendorJob> {
    return this.dispatch.complete(user, id, parseBody(CompleteJobSchema, body), files?.[0]);
  }
}
