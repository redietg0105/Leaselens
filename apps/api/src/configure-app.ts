import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { clientIpProbe } from './common/client-ip-probe';
import { sameOriginWrites } from './common/same-origin';

/** Shared app setup, used by main.ts and by the e2e tests. */
export function configureApp(app: INestApplication) {
  // Behind N proxies, take the visitor's address from X-Forwarded-For (rate limits are per address).
  // With the default 0 the header is ignored, so a visitor can't fake their address to dodge limits.
  const proxies = Number(process.env.TRUST_PROXY || 0);
  if (proxies > 0) (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set('trust proxy', proxies);
  // One-off deployment check of the proxy chain (see client-ip-probe.ts).
  if (process.env.LOG_CLIENT_IP_ONCE === 'on') app.use(clientIpProbe());

  // same-site (not same-origin) so <img> tags on the web app (:3000) can load photos from the API (:4100).
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cookieParser());
  const webUrl = process.env.WEB_URL ?? 'http://localhost:3000';
  app.enableCors({
    // Only the web app may call the API with cookies.
    origin: webUrl,
    credentials: true,
  });
  // Writes from another site are refused even if a browser would send the cookie.
  app.use(sameOriginWrites(webUrl));
  app.useGlobalFilters(new AllExceptionsFilter());
}
