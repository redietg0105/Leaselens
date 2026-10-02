import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AllExceptionsFilter } from './all-exceptions.filter';

/** Shared app setup, used by main.ts and by the e2e tests. */
export function configureApp(app: INestApplication) {
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    // Only the web app may call the API with cookies.
    origin: process.env.WEB_URL ?? 'http://localhost:3000',
    credentials: true,
  });
  app.useGlobalFilters(new AllExceptionsFilter());
}
