import { Global, Module } from '@nestjs/common';
import { GcsStorageService } from './gcs-storage.service';
import { LocalStorageService, StorageService } from './storage.service';

/** Local disk by default; a Cloud Storage bucket when STORAGE_DRIVER=gcs (deployed on Cloud Run). */
export function storageFromEnv(env: NodeJS.ProcessEnv = process.env): StorageService {
  if (env.STORAGE_DRIVER === 'gcs') {
    if (!env.GCS_BUCKET) throw new Error('STORAGE_DRIVER="gcs" needs GCS_BUCKET');
    return new GcsStorageService(env.GCS_BUCKET);
  }
  return new LocalStorageService();
}

@Global()
@Module({
  providers: [{ provide: StorageService, useFactory: () => storageFromEnv() }],
  exports: [StorageService],
})
export class StorageModule {}
