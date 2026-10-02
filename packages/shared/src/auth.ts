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
  redirectTo: z.enum(['/tenant', '/staff']),
});
export type VerifyLinkResponse = z.infer<typeof VerifyLinkResponseSchema>;

/** Tenants and vendors use the tenant portal; everyone else uses the staff app. */
export function homePathForRole(role: Role): '/tenant' | '/staff' {
  return role === 'TENANT' || role === 'VENDOR' ? '/tenant' : '/staff';
}
