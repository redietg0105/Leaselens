import { Injectable, Logger } from '@nestjs/common';

/** Sends sign-in links. Development prints them in the API terminal; SendGrid comes later. */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');

  async sendMagicLink(email: string, url: string): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      // Never print a usable link in production logs.
      this.logger.warn(`Email sending is not configured; sign-in link for ${email} was not sent.`);
      return;
    }
    this.logger.log(`Sign-in link for ${email} (valid 15 minutes, one use):\n\n    ${url}\n`);
  }
}
