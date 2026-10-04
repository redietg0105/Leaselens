import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  mixin,
  NestInterceptor,
  PayloadTooLargeException,
  type Type,
} from '@nestjs/common';
import { MAX_PHOTO_BYTES, MAX_PHOTOS, PHOTO_ERRORS } from '@leaselens/shared';
import type { Request, Response } from 'express';
import multer from 'multer';

/**
 * Parses multipart/form-data with up to `maxCount` files in `field`, kept in memory with hard limits.
 * Runs after the guards, so signed-out or wrong-role requests are rejected before any upload is read.
 */
export function PhotoUpload(field: string, maxCount: number): Type<NestInterceptor> {
  const tooMany = maxCount === 1 ? 'You can add one photo.' : PHOTO_ERRORS.tooMany;

  @Injectable()
  class PhotoUploadMixin implements NestInterceptor {
    private readonly upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: MAX_PHOTO_BYTES, files: maxCount, fields: 10, fieldSize: 10_000, parts: 20 },
    }).array(field, maxCount);

    async intercept(context: ExecutionContext, next: CallHandler) {
      const http = context.switchToHttp();
      const req = http.getRequest<Request>();
      const res = http.getResponse<Response>();

      await new Promise<void>((resolve, reject) => {
        this.upload(req, res, (err: unknown) => {
          if (!err) return resolve();
          if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') return reject(new PayloadTooLargeException(PHOTO_ERRORS.tooLarge));
            if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
              return reject(new BadRequestException(tooMany));
            }
          }
          reject(new BadRequestException('The upload could not be read. Please try again.'));
        });
      });
      return next.handle();
    }
  }
  return mixin(PhotoUploadMixin);
}

/** Tenant request photos: field "photos", up to 3. */
export const PhotoUploadInterceptor = PhotoUpload('photos', MAX_PHOTOS);
