import { z } from 'zod';
import { CategorySchema, EntryPermissionSchema, UrgencySchema, WorkOrderStatusSchema, type WorkOrderStatus } from './enums';
import { EmergencyRuleIdSchema } from './triage';

// ───────────── Photo rules (browser and API) ─────────────

export const MAX_PHOTOS = 3;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type PhotoType = (typeof ALLOWED_PHOTO_TYPES)[number];

/** Bytes needed by detectImageType. */
export const IMAGE_SNIFF_BYTES = 12;

/**
 * The real image type from the file's first bytes ("magic number"), ignoring its name and the
 * type the browser claims. Returns null for anything that isn't JPEG, PNG or WebP.
 */
export function detectImageType(bytes: Uint8Array): PhotoType | null {
  const at = (offset: number, sig: number[]) => sig.every((b, i) => bytes[offset + i] === b);
  if (bytes.length >= 3 && at(0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (bytes.length >= 8 && at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  // "RIFF" .... "WEBP"
  if (bytes.length >= 12 && at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return 'image/webp';
  return null;
}

export const PHOTO_ERRORS = {
  tooMany: `You can add up to ${MAX_PHOTOS} photos.`,
  tooLarge: 'Each photo must be 5 MB or smaller.',
  badType: 'Photos must be JPG, PNG or WebP images.',
} as const;

/** Checks one photo's size and real type. Returns an error message, or null if it's fine. */
export function photoProblem(size: number, firstBytes: Uint8Array): string | null {
  if (size > MAX_PHOTO_BYTES) return PHOTO_ERRORS.tooLarge;
  if (!detectImageType(firstBytes)) return PHOTO_ERRORS.badType;
  return null;
}

// ───────────── New request form ─────────────

export const DESCRIPTION_MIN = 10;
export const DESCRIPTION_MAX = 1000;
export const ACCESS_NOTES_MAX = 500;

export const CreateWorkOrderSchema = z.object({
  description: z
    .string({ error: 'Describe the problem.' })
    .trim()
    .min(DESCRIPTION_MIN, `Please describe the problem in at least ${DESCRIPTION_MIN} characters.`)
    .max(DESCRIPTION_MAX, `Please keep the description under ${DESCRIPTION_MAX} characters.`),
  entryPermission: z.enum(EntryPermissionSchema.options, { error: 'Choose whether we may enter.' }),
  accessNotes: z
    .string()
    .trim()
    .max(ACCESS_NOTES_MAX, `Access notes must be ${ACCESS_NOTES_MAX} characters or fewer.`)
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export type CreateWorkOrderInput = z.input<typeof CreateWorkOrderSchema>;
export type CreateWorkOrder = z.output<typeof CreateWorkOrderSchema>;

// ───────────── Responses ─────────────

export const WorkOrderSummarySchema = z.object({
  id: z.string(),
  description: z.string(),
  status: WorkOrderStatusSchema,
  createdAt: z.string(),
  photoCount: z.number().int(),
});
export type WorkOrderSummary = z.infer<typeof WorkOrderSummarySchema>;

export const WorkOrderDetailSchema = WorkOrderSummarySchema.extend({
  entryPermission: EntryPermissionSchema,
  accessNotes: z.string().nullable(),
  unit: z.object({ number: z.string(), building: z.string() }),
  /** Photo URLs are API paths, e.g. /work-orders/<id>/media/<mediaId>. Access is checked on each request. */
  photos: z.array(z.object({ id: z.string(), url: z.string() })),
  /** Set as soon as an emergency rule matches — before the AI runs. */
  emergencyRule: EmergencyRuleIdSchema.nullable(),
  urgency: UrgencySchema.nullable(),
  category: CategorySchema.nullable(),
  /** Short AI description of the issue, e.g. "Leak under bathroom sink". */
  subIssue: z.string().nullable(),
  /** Questions waiting for the tenant (status NEEDS_INFO), from the approved bank. */
  followUpQuestions: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      options: z.array(z.object({ value: z.string(), label: z.string() })),
    }),
  ),
  answers: z.array(z.object({ questionId: z.string(), question: z.string(), answer: z.string() })),
  /** Set when the vendor marked the job complete. */
  completion: z.object({ completedAt: z.string(), note: z.string().nullable() }).nullable(),
});
export type WorkOrderDetail = z.infer<typeof WorkOrderDetailSchema>;

// ───────────── Labels for tenants ─────────────

/** Tenant-facing wording. Internal states like NEEDS_REVIEW are shown as plain progress. */
export const TENANT_STATUS_LABEL: Record<WorkOrderStatus, string> = {
  SUBMITTED: 'Received',
  NEEDS_INFO: 'Needs your answer',
  TRIAGED: 'Being reviewed',
  NEEDS_REVIEW: 'Being reviewed',
  DISPATCHED: 'Technician assigned',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const ENTRY_PERMISSION_LABEL = {
  YES: 'Yes, you may enter',
  NO: 'No, only when I am home',
  CALL_FIRST: 'Call me first',
} as const;
