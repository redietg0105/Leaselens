/**
 * Applies pending migrations with `prisma migrate deploy` (never resets or seeds). Runs as the Cloud Run job
 * `leaselens-migrate` before each API deploy. Trims the database URLs first, because the Prisma CLI reads them
 * itself and a secret entered by hand may end with a newline. Prisma's output is printed with the database
 * host hidden (it is part of the URL secret).
 */
import { spawnSync } from 'node:child_process';
import { redactDbHost } from '../common/redact-db-host';
import { trimSecrets } from '../config/env';

trimSecrets();
if (!process.env.DATABASE_URL || !process.env.DIRECT_URL) {
  console.error('migrate-deploy: DATABASE_URL and DIRECT_URL must both be set.');
  process.exit(1);
}
const prismaCli = require.resolve('prisma/build/index.js');
const result = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], { env: process.env, encoding: 'utf8' });
if (result.stdout) process.stdout.write(redactDbHost(result.stdout));
if (result.stderr) process.stderr.write(redactDbHost(result.stderr));
process.exit(result.status ?? 1);
