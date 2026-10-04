import { Module } from '@nestjs/common';
import { VendorController } from '../vendor/vendor.controller';
import { AUTO_DISPATCH_LIMIT_USD, autoDispatchLimitFromEnv, DispatchService } from './dispatch.service';

@Module({
  controllers: [VendorController],
  providers: [
    DispatchService,
    // Read when the app starts (after .env is loaded).
    { provide: AUTO_DISPATCH_LIMIT_USD, useFactory: () => autoDispatchLimitFromEnv() },
  ],
  exports: [DispatchService],
})
export class DispatchModule {}
