import { Global, Module } from '@nestjs/common';
import { LocalStorageService, StorageService } from './storage.service';

@Global()
@Module({
  providers: [{ provide: StorageService, useFactory: () => new LocalStorageService() }],
  exports: [StorageService],
})
export class StorageModule {}
