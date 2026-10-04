import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { checkEnv } from './config/env';
import { configureApp } from './configure-app';

// Load apps/api/.env in development if it exists (Node >= 20.12). Real env vars win.
try {
  process.loadEnvFile('.env');
} catch {
  // No .env file — rely on the environment.
}

// Fail fast with a clear message if the configuration is wrong.
const env = checkEnv();
for (const w of env.warnings) console.warn(`[config] ${w}`);
if (!env.ok) {
  console.error('[config] The API cannot start:\n' + env.errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
  app.enableShutdownHooks(); // close the database connection cleanly on Ctrl+C / container stop
  configureApp(app);

  // Last resort: never let a stray promise rejection go unnoticed.
  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled promise rejection: ${reason instanceof Error ? reason.stack : String(reason)}`, 'Process');
  });

  const port = Number(process.env.PORT ?? 4100);
  await app.listen(port);
  logger.log(`API listening on http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();
