import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { RolesGuard } from './auth/roles.guard';
import { SessionGuard } from './auth/session.guard';
import { HealthController } from './health/health.controller';
import { loggerParams } from './logging/logging';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { StaffModule } from './staff/staff.module';
import { StorageModule } from './storage/storage.module';
import { WorkOrdersModule } from './work-orders/work-orders.module';

@Module({
  imports: [
    // Structured request logs with request ids; cookies and auth headers redacted. Built at startup (after .env loads).
    LoggerModule.forRootAsync({ useFactory: () => loggerParams() }),
    // Generous default; sensitive routes set tighter limits with @Throttle.
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
      errorMessage: 'Too many requests. Please wait a few minutes and try again.',
    }),
    PrismaModule,
    StorageModule,
    NotificationsModule,
    AuthModule,
    WorkOrdersModule,
    StaffModule,
  ],
  controllers: [HealthController],
  providers: [
    // Global guards run in this order: rate limit → session → roles.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
