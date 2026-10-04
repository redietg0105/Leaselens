import { z } from 'zod';
import { RoleSchema, type Role } from './enums';

export const SESSION_COOKIE = 'll_session';
export const MAGIC_LINK_TTL_MINUTES = 15;
export const SESSION_TTL_DAYS = 7;

/** Shown for every request-link call, whether or not the account exists. */
export const REQUEST_LINK_MESSAGE =
  'If that email belongs to a LeaseLens account, we sent a sign-in link. It expires in 15 minutes.';
export const INVALID_LINK_MESSAGE = 'This sign-in link is invalid or has expired. Please request a new one.';

export const RequestLinkSchema = z.object({
  // Trim and lowercase before validating, so " Name@Example.com " is accepted.
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
});
export type RequestLinkInput = z.input<typeof RequestLinkSchema>;

export const VerifyLinkSchema = z.object({
  token: z.string().min(20).max(200),
});
export type VerifyLinkInput = z.infer<typeof VerifyLinkSchema>;

export const MeSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: RoleSchema,
});
export type Me = z.infer<typeof MeSchema>;

export const VerifyLinkResponseSchema = z.object({
  user: MeSchema,
  redirectTo: z.enum(['/tenant', '/staff', '/vendor/jobs']),
});
export type VerifyLinkResponse = z.infer<typeof VerifyLinkResponseSchema>;

export type Area = '/tenant' | '/vendor' | '/staff';

/** Each role has its own area of the web app: tenants, vendors, or staff. */
export function areaForRole(role: Role): Area {
  return role === 'TENANT' ? '/tenant' : role === 'VENDOR' ? '/vendor' : '/staff';
}

/** Where a user lands after signing in. */
export function homePathForRole(role: Role): '/tenant' | '/staff' | '/vendor/jobs' {
  const area = areaForRole(role);
  return area === '/vendor' ? '/vendor/jobs' : area;
}

// ───────────── Demo mode (local only) ─────────────

/** The seeded demo accounts, shown as one-click buttons on the sign-in page in demo mode. */
export const DEMO_ACCOUNTS = [
  { role: 'TENANT', label: 'Tenant', email: 'tenant@leaselens.test', name: 'Jordan Ellery' },
  { role: 'COORDINATOR', label: 'Coordinator', email: 'coordinator@leaselens.test', name: 'Riley Castellan' },
  { role: 'MANAGER', label: 'Manager', email: 'manager@leaselens.test', name: 'Morgan Pell' },
  { role: 'VENDOR', label: 'Vendor', email: 'vendor@leaselens.test', name: 'Sam Thornbury' },
  { role: 'LEASING', label: 'Leasing', email: 'leasing@leaselens.test', name: 'Avery Lindqvist' },
] as const satisfies readonly { role: Role; label: string; email: string; name: string }[];
export type DemoAccount = (typeof DEMO_ACCOUNTS)[number];

export const RequestLinkResponseSchema = z.object({
  message: z.string(),
  /** Only in demo mode, only for a known account: the link that would have been emailed. */
  demo: z.object({ signInUrl: z.url() }).optional(),
});
export type RequestLinkResponse = z.infer<typeof RequestLinkResponseSchema>;

export const DemoInfoSchema = z.object({
  enabled: z.boolean(),
  accounts: z
    .array(z.object({ role: RoleSchema, label: z.string(), email: z.string(), name: z.string() }))
    .optional(),
});
export type DemoInfo = z.infer<typeof DemoInfoSchema>;
