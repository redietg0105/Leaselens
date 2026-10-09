import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { MAGIC_LINK_TTL_MINUTES } from '@leaselens/shared';

/** Sends sign-in links. Chosen by mailServiceFromEnv(): SMTP when configured, otherwise the console. */
export abstract class MailService {
  abstract sendMagicLink(email: string, url: string): Promise<void>;
}

/** Development: prints the link in the API terminal. In production it never prints a link or an address. */
@Injectable()
export class ConsoleMailService extends MailService {
  private readonly logger = new Logger('Mail');

  async sendMagicLink(email: string, url: string): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      // Never print a usable link — or the email address — in production logs.
      this.logger.warn('Email sending is not configured; a sign-in link was not sent.');
      return;
    }
    this.logger.log(`Sign-in link for ${email} (valid 15 minutes, one use):\n\n    ${url}\n`);
  }
}

export interface SmtpSettings {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
}

/** Emails the link over SMTP (e.g. Gmail with an app password). Logs neither the address nor the link. */
export class SmtpMailService extends MailService {
  private readonly logger = new Logger('Mail');

  constructor(
    private readonly settings: SmtpSettings,
    private readonly transport: Pick<Transporter, 'sendMail'> = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.port === 465, // implicit TLS on 465; STARTTLS (required) otherwise
      requireTLS: settings.port !== 465,
      auth: { user: settings.user, pass: settings.password },
    }),
  ) {
    super();
  }

  async sendMagicLink(email: string, url: string): Promise<void> {
    try {
      await this.transport.sendMail({
        from: this.settings.from,
        to: email,
        subject: 'Your LeaseLens sign-in link',
        text: [
          'Use this link to sign in to LeaseLens:',
          '',
          url,
          '',
          `It works once and expires in ${MAGIC_LINK_TTL_MINUTES} minutes. If you didn't ask for it, ignore this email.`,
        ].join('\n'),
      });
      this.logger.log('Sign-in email sent');
    } catch (err) {
      // SMTP error messages can quote the recipient's address, so only the error's code is logged, and a
      // clean error goes back to the caller (which runs this in the background — same response either way).
      const e = err as { code?: unknown; responseCode?: unknown };
      const code = [e.code, e.responseCode].filter((x) => typeof x === 'string' || typeof x === 'number').join(' ');
      this.logger.error(`Sign-in email could not be sent${code ? ` (${code})` : ''}`);
      throw new Error(`Sign-in email could not be sent${code ? ` (${code})` : ''}`);
    }
  }
}

/** SMTP when SMTP_HOST, SMTP_USER and SMTP_PASSWORD are set; otherwise the console (development). */
export function mailServiceFromEnv(env: NodeJS.ProcessEnv = process.env): MailService {
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD) {
    return new SmtpMailService({
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT || 465),
      user: env.SMTP_USER,
      password: env.SMTP_PASSWORD,
      from: env.MAIL_FROM || `LeaseLens <${env.SMTP_USER}>`,
    });
  }
  return new ConsoleMailService();
}
