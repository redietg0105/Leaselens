import { z } from 'zod';

/** User roles. The server reads the role from the database, never from the client. */
export const RoleSchema = z.enum(['TENANT', 'VENDOR', 'COORDINATOR', 'LEASING', 'MANAGER']);
export type Role = z.infer<typeof RoleSchema>;

/** Roles that use the staff app (`/staff/*`). */
export const STAFF_ROLES = ['COORDINATOR', 'LEASING', 'MANAGER'] as const satisfies readonly Role[];

export const UrgencySchema = z.enum(['EMERGENCY', 'URGENT', 'ROUTINE']);
export type Urgency = z.infer<typeof UrgencySchema>;

export const CategorySchema = z.enum([
  'PLUMBING',
  'ELECTRICAL',
  'HVAC',
  'APPLIANCE',
  'PEST',
  'STRUCTURAL',
  'LOCKS_ACCESS',
  'OTHER',
]);
export type Category = z.infer<typeof CategorySchema>;
