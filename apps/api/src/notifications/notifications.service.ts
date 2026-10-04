import { Injectable, Logger } from '@nestjs/common';
import type { NotificationChannel, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Db = Prisma.TransactionClient | PrismaService;

/** Writes a Notification row and logs it. Console only in development; Twilio/SendGrid later. */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');

  constructor(private readonly prisma: PrismaService) {}

  async send(input: { channel: NotificationChannel; to: string; body: string }, db: Db = this.prisma): Promise<void> {
    await db.notification.create({ data: { ...input, sentAt: new Date() } });
    const line = `[${input.channel}] to ${input.to}: ${input.body}`;
    if (input.channel === 'ONCALL') this.logger.warn(line);
    else this.logger.log(line);
  }
}
