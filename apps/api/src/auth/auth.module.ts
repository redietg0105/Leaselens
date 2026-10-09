import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MailService, mailServiceFromEnv } from './mail.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, { provide: MailService, useFactory: () => mailServiceFromEnv() }],
  exports: [AuthService],
})
export class AuthModule {}
