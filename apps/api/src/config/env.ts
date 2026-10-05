import { z } from 'zod';

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
}).refine((e) => !(e.DEMO_MODE === 'on' && e.NODE_ENV === 'production'), {
  message: 'DEMO_MODE must be "off" when NODE_ENV is production — demo mode shows sign-in links in the browser.',
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
  return { ok: errors.length === 0, errors, warnings };
}
