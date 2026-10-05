import { Injectable, Logger } from '@nestjs/common';
import type { NotificationChannel, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Db = Prisma.TransactionClient | PrismaService;

/**
 * Writes a Notification row and logs it. In development the log line is the "delivery" (console only;
 * Twilio/SendGrid later), so it shows the recipient and text. In production it shows only the channel
 * and id: recipients are tenant emails and bodies quote what tenants wrote — personal data that
 * doesn't belong in logs.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');

  constructor(private readonly prisma: PrismaService) {}

  async send(input: { channel: NotificationChannel; to: string; body: string }, db: Db = this.prisma): Promise<void> {
    const row = await db.notification.create({ data: { ...input, sentAt: new Date() } });
    const line =
      process.env.NODE_ENV === 'production'
        ? `[${input.channel}] notification ${row.id} queued`
        : `[${input.channel}] to ${input.to}: ${input.body}`;
    if (input.channel === 'ONCALL') this.logger.warn(line);
    else this.logger.log(line);
  }
}
