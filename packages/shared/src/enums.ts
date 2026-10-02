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

export const WorkOrderStatusSchema = z.enum([
  'SUBMITTED',
  'NEEDS_INFO',
  'TRIAGED',
  'NEEDS_REVIEW',
  'DISPATCHED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
]);
export type WorkOrderStatus = z.infer<typeof WorkOrderStatusSchema>;

/** May staff or a vendor enter the apartment when the tenant isn't home? */
export const EntryPermissionSchema = z.enum(['YES', 'NO', 'CALL_FIRST']);
export type EntryPermission = z.infer<typeof EntryPermissionSchema>;
