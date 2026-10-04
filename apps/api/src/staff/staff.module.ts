import { Module } from '@nestjs/common';
import { DispatchModule } from '../dispatch/dispatch.module';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

@Module({
  imports: [DispatchModule],
  controllers: [StaffController],
  providers: [StaffService],
})
export class StaffModule {}
