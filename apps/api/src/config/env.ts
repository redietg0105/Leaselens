import { z } from 'zod';
import { isLocalWebUrl } from './demo';

const url = (name: string) =>
  z.url({ protocol: /^https?$/, error: `${name} must be a full URL, e.g. http://localhost:3000` });
const optionalNumber = (name: string, min: number, max = Number.MAX_SAFE_INTEGER) =>
  z.coerce
    .number({ error: `${name} must be a number` })
    .min(min, `${name} must be at least ${min}`)
    .max(max, `${name} must be at most ${max}`)
    .optional();

/**
 * What the API needs to start. Checked once at startup so a missing or malformed setting fails
 * immediately with a clear message, instead of later with a confusing one.
 */
export const EnvSchema = z.object({
  DATABASE_URL: z
    .string({ error: 'DATABASE_URL is missing — copy apps/api/.env.example to apps/api/.env and add your Neon pooled URL' })
    .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL must start with postgresql://'),
  DIRECT_URL: z.string().regex(/^postgres(ql)?:\/\//, 'DIRECT_URL must start with postgresql://').optional(),
  WEB_URL: url('WEB_URL').optional(),
  API_URL: url('API_URL').optional(),
  PORT: optionalNumber('PORT', 1, 65535),
  TRUST_PROXY: optionalNumber('TRUST_PROXY', 0, 10),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
  GEMINI_FALLBACK_MODEL: z.string().optional(),
  TRIAGE_TIMEOUT_MS: optionalNumber('TRIAGE_TIMEOUT_MS', 1000, 120_000),
  AUTO_DISPATCH_LIMIT_USD: optionalNumber('AUTO_DISPATCH_LIMIT_USD', 0),
  HEATING_SEASON_START: z.string().regex(/^\d{2}-\d{2}$/, 'HEATING_SEASON_START must look like 10-01').optional(),
  HEATING_SEASON_END: z.string().regex(/^\d{2}-\d{2}$/, 'HEATING_SEASON_END must look like 05-01').optional(),
  TRIAGE_SWEEP: z.enum(['on', 'off'], { error: 'TRIAGE_SWEEP must be "on" or "off"' }).optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).optional(),
  DEMO_MODE: z.enum(['on', 'off'], { error: 'DEMO_MODE must be "on" or "off"' }).optional(),
  // Where photos are stored: local disk (development) or a Cloud Storage bucket (deployed).
  STORAGE_DRIVER: z.enum(['local', 'gcs'], { error: 'STORAGE_DRIVER must be "local" or "gcs"' }).optional(),
  GCS_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/, 'GCS_BUCKET must be a bucket name, e.g. my-project-uploads').optional(),
  // Sign-in emails over SMTP (e.g. Gmail with an app password). Not set → links are printed (development only).
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: optionalNumber('SMTP_PORT', 1, 65535),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  // Deployment check: log the forwarded-for chain (masked) once, to choose TRUST_PROXY. Leave off.
  LOG_CLIENT_IP_ONCE: z.enum(['on', 'off'], { error: 'LOG_CLIENT_IP_ONCE must be "on" or "off"' }).optional(),
}).refine((e) => !(e.STORAGE_DRIVER === 'gcs' && !e.GCS_BUCKET), {
  message: 'STORAGE_DRIVER="gcs" needs GCS_BUCKET (the bucket for photos).',
}).refine((e) => !(e.SMTP_HOST && (!e.SMTP_USER || !e.SMTP_PASSWORD)), {
  message: 'SMTP_HOST is set, so SMTP_USER and SMTP_PASSWORD are needed too.',
}).refine((e) => !(e.DEMO_MODE === 'on' && e.NODE_ENV === 'production'), {
  message: 'DEMO_MODE must be "off" when NODE_ENV is production — demo mode shows sign-in links in the browser.',
}).refine((e) => !(e.DEMO_MODE === 'on' && !isLocalWebUrl(e.WEB_URL)), {
  message: 'DEMO_MODE="on" only works when WEB_URL is localhost or a private network address — demo mode shows sign-in links in the browser.',
});

export interface EnvCheck {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/** Empty strings count as "not set" (.env files often have KEY=""). */
function withoutEmpty(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(Object.entries(env).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1] !== ''));
}

export function checkEnv(env: NodeJS.ProcessEnv = process.env): EnvCheck {
  const values = withoutEmpty(env);
  const result = EnvSchema.safeParse(values);
  const errors = result.success ? [] : result.error.issues.map((i) => i.message);
  const warnings: string[] = [];
  if (!values.GEMINI_API_KEY) warnings.push('GEMINI_API_KEY is not set — AI triage will fail and requests go to NEEDS_REVIEW.');
  if (!values.DIRECT_URL) warnings.push('DIRECT_URL is not set — the app runs, but `npm run db:migrate` needs it.');
  if (!values.WEB_URL) warnings.push('WEB_URL is not set — using http://localhost:3000 for CORS and sign-in links.');
  if (values.NODE_ENV === 'production' && !values.SMTP_HOST) warnings.push('SMTP_HOST is not set — sign-in emails will not be sent.');
  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Settings that hold secrets. Entering a value by hand (e.g. `gcloud secrets versions add … --data-file=-` on
 * Windows) easily adds a trailing newline or space, which would break a database URL, an API key or a password.
 */
export const SECRET_KEYS = ['DATABASE_URL', 'DIRECT_URL', 'GEMINI_API_KEY', 'SMTP_PASSWORD', 'SESSION_SECRET'] as const;

/** Trims surrounding whitespace from every secret setting, in place, before anything reads them. */
export function trimSecrets(env: NodeJS.ProcessEnv = process.env): void {
  for (const key of SECRET_KEYS) {
    const value = env[key];
    if (typeof value === 'string') env[key] = value.trim();
  }
}
