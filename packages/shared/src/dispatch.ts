import { z } from 'zod';
import {
  CategorySchema,
  EntryPermissionSchema,
  UrgencySchema,
  WorkOrderStatusSchema,
  type Category,
  type Urgency,
  type WorkOrderStatus,
} from './enums';
import { EmergencyRuleIdSchema } from './triage';

// ───────────── Cost estimate ─────────────

/** Typical hours on site per trade. Estimated cost = vendor hourly rate × these hours. */
export const ESTIMATED_HOURS: Record<Category, number> = {
  PLUMBING: 2,
  ELECTRICAL: 2,
  HVAC: 2.5,
  APPLIANCE: 1.5,
  PEST: 1,
  STRUCTURAL: 3,
  LOCKS_ACCESS: 1,
  OTHER: 2,
};

export const CATEGORY_SHORT: Record<Category, string> = {
  PLUMBING: 'Plumbing',
  ELECTRICAL: 'Electrical',
  HVAC: 'Heating & cooling',
  APPLIANCE: 'Appliances',
  PEST: 'Pest control',
  STRUCTURAL: 'Structural',
  LOCKS_ACCESS: 'Locks & doors',
  OTHER: 'General repairs',
};

export function estimateCostUsd(hourlyRate: number, category: Category): number {
  return Math.round(hourlyRate * ESTIMATED_HOURS[category] * 100) / 100;
}

// ───────────── Vendor matching ─────────────

export interface VendorForMatching {
  id: string;
  name: string;
  trades: Category[];
  hourlyRate: number;
  firstTimeFixRate: number;
  available: boolean;
}

export const VendorMatchSchema = z.object({
  vendorId: z.string(),
  name: z.string(),
  score: z.number(),
  available: z.boolean(),
  firstTimeFixRate: z.number(),
  hourlyRate: z.number(),
  estimatedCostUsd: z.number(),
  reason: z.string(),
});
export type VendorMatch = z.infer<typeof VendorMatchSchema>;

const usd = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

/**
 * Top vendors for a category. Trade match is required; then score =
 * available (40) + first-time-fix rate × 40 − relative cost × 20.
 * Ties go to the cheaper vendor, then by name, so the order is stable.
 */
export function rankVendors(category: Category, vendors: VendorForMatching[], limit = 3): VendorMatch[] {
  const matching = vendors.filter((v) => v.trades.includes(category));
  if (matching.length === 0) return [];
  const costs = matching.map((v) => estimateCostUsd(v.hourlyRate, category));
  const maxCost = Math.max(...costs) || 1;

  return matching
    .map((v, i) => {
      const estimatedCostUsd = costs[i];
      const score = Math.round(((v.available ? 40 : 0) + v.firstTimeFixRate * 40 - (estimatedCostUsd / maxCost) * 20) * 10) / 10;
      const reason = [
        CATEGORY_SHORT[category],
        v.available ? 'available now' : 'not available right now',
        `fixes ${Math.round(v.firstTimeFixRate * 100)}% on first visit`,
        `${usd(v.hourlyRate)}/h, about ${usd(estimatedCostUsd)}`,
      ].join(' · ');
      return {
        vendorId: v.id,
        name: v.name,
        score,
        available: v.available,
        firstTimeFixRate: v.firstTimeFixRate,
        hourlyRate: v.hourlyRate,
        estimatedCostUsd,
        reason,
      };
    })
    .sort((a, b) => b.score - a.score || a.estimatedCostUsd - b.estimatedCostUsd || a.name.localeCompare(b.name))
    .slice(0, limit);
}

// ───────────── Auto-dispatch ─────────────

export const AUTO_DISPATCH_MIN_CONFIDENCE = 0.8;

export interface AutoDispatchInput {
  urgency: Urgency | null;
  status: WorkOrderStatus;
  aiValid: boolean;
  confidence: number | null;
  emergencyRule: string | null;
  top: VendorMatch | undefined;
  limitUsd: number;
}

/**
 * May this job be sent to a vendor without a coordinator? Only routine, confidently triaged jobs whose
 * best vendor is available and costs less than the limit. Returns why not, for the audit log.
 */
export function autoDispatchDecision(i: AutoDispatchInput): { dispatch: boolean; reason: string } {
  if (!(i.limitUsd > 0)) return { dispatch: false, reason: 'Auto-dispatch is turned off (limit 0)' };
  if (i.status !== 'TRIAGED') return { dispatch: false, reason: `Status is ${i.status}` };
  if (i.urgency !== 'ROUTINE') return { dispatch: false, reason: `Urgency is ${i.urgency ?? 'unknown'}` };
  if (i.emergencyRule) return { dispatch: false, reason: `Emergency rule ${i.emergencyRule} matched` };
  if (!i.aiValid || i.confidence === null || i.confidence < AUTO_DISPATCH_MIN_CONFIDENCE) {
    return { dispatch: false, reason: `AI confidence ${i.confidence ?? 'none'} is below ${AUTO_DISPATCH_MIN_CONFIDENCE}` };
  }
  if (!i.top) return { dispatch: false, reason: 'No vendor with the right trade' };
  if (!i.top.available) return { dispatch: false, reason: `Best vendor ${i.top.name} is not available` };
  if (!(i.top.estimatedCostUsd < i.limitUsd)) {
    return { dispatch: false, reason: `Estimated ${usd(i.top.estimatedCostUsd)} is not below the ${usd(i.limitUsd)} limit` };
  }
  return { dispatch: true, reason: `Routine, confidence ${i.confidence}, estimated ${usd(i.top.estimatedCostUsd)} < ${usd(i.limitUsd)}` };
}

// ───────────── Staff queue ─────────────

/** Queue order: EMERGENCY, URGENT, not yet known, ROUTINE — then oldest first. */
export const QUEUE_URGENCY_RANK: Record<Urgency | 'NONE', number> = { EMERGENCY: 0, URGENT: 1, NONE: 2, ROUTINE: 3 };

export const QueueFilterSchema = z.object({
  urgency: z.enum(['EMERGENCY', 'URGENT', 'ROUTINE', 'NONE']).optional(),
  status: WorkOrderStatusSchema.optional(),
});
export type QueueFilter = z.infer<typeof QueueFilterSchema>;

export const QueueItemSchema = z.object({
  id: z.string(),
  description: z.string(),
  building: z.string(),
  unit: z.string(),
  category: CategorySchema.nullable(),
  urgency: UrgencySchema.nullable(),
  confidence: z.number().nullable(),
  /** A person has changed the category or urgency, so the AI's confidence no longer describes them. */
  overridden: z.boolean(),
  status: WorkOrderStatusSchema,
  createdAt: z.string(),
  photoCount: z.number().int(),
  emergencyRule: EmergencyRuleIdSchema.nullable(),
  autoDispatched: z.boolean(),
});
export type QueueItem = z.infer<typeof QueueItemSchema>;

export const STAFF_STATUS_LABEL: Record<WorkOrderStatus, string> = {
  SUBMITTED: 'Waiting for AI',
  NEEDS_INFO: 'Needs tenant info',
  TRIAGED: 'Triaged',
  NEEDS_REVIEW: 'Needs review',
  DISPATCHED: 'Dispatched',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

// ───────────── Staff request detail ─────────────

const PhotoSchema = z.object({ id: z.string(), url: z.string() });

export const TriageHistoryEntrySchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  kind: z.enum(['ai', 'override']),
  model: z.string(),
  promptVersion: z.string(),
  valid: z.boolean(),
  category: CategorySchema.nullable(),
  urgency: UrgencySchema.nullable(),
  confidence: z.number().nullable(),
  subIssue: z.string().nullable(),
  emergencyRule: z.string().nullable(),
  error: z.string().nullable(),
  overriddenBy: z.string().nullable(),
  overrideReason: z.string().nullable(),
});
export type TriageHistoryEntry = z.infer<typeof TriageHistoryEntrySchema>;

export const DispatchInfoSchema = z.object({
  id: z.string(),
  vendor: z.string(),
  autoDispatched: z.boolean(),
  approvedBy: z.string().nullable(),
  estimatedCostUsd: z.number().nullable(),
  matchReason: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  completionNote: z.string().nullable(),
});
export type DispatchInfo = z.infer<typeof DispatchInfoSchema>;

export const StaffWorkOrderSchema = z.object({
  id: z.string(),
  description: z.string(),
  status: WorkOrderStatusSchema,
  createdAt: z.string(),
  slaDueAt: z.string().nullable(),
  unit: z.object({ number: z.string(), building: z.string(), address: z.string(), unitType: z.string() }),
  entryPermission: EntryPermissionSchema,
  accessNotes: z.string().nullable(),
  category: CategorySchema.nullable(),
  urgency: UrgencySchema.nullable(),
  confidence: z.number().nullable(),
  /** A person has changed the category or urgency (shown as "Changed by staff" instead of the AI confidence). */
  overridden: z.boolean(),
  emergencyRule: EmergencyRuleIdSchema.nullable(),
  subIssue: z.string().nullable(),
  summaryForVendor: z.string().nullable(),
  photos: z.array(PhotoSchema),
  completionPhotos: z.array(PhotoSchema),
  answers: z.array(z.object({ questionId: z.string(), question: z.string(), answer: z.string() })),
  triageHistory: z.array(TriageHistoryEntrySchema),
  dispatches: z.array(DispatchInfoSchema),
});
export type StaffWorkOrder = z.infer<typeof StaffWorkOrderSchema>;

// ───────────── Actions ─────────────

export const OVERRIDE_REASON_MIN = 10;
export const LOWER_EMERGENCY_REASON_MIN = 20;

export const OverrideSchema = z
  .object({
    category: CategorySchema.optional(),
    urgency: UrgencySchema.optional(),
    reason: z
      .string({ error: 'Give a reason for the change.' })
      .trim()
      .min(OVERRIDE_REASON_MIN, `Give a reason of at least ${OVERRIDE_REASON_MIN} characters.`)
      .max(500, 'Keep the reason under 500 characters.'),
    /** Must be true to lower an EMERGENCY. */
    confirmLowerEmergency: z.boolean().optional(),
  })
  .refine((o) => o.category || o.urgency, { message: 'Change the category or the urgency.' });
export type OverrideInput = z.infer<typeof OverrideSchema>;

export const DispatchRequestSchema = z.object({ vendorId: z.string().min(1).max(100) });

// ───────────── Vendor jobs ─────────────

export const VendorJobSummarySchema = z.object({
  id: z.string(),
  workOrderId: z.string(),
  summary: z.string(),
  category: CategorySchema.nullable(),
  urgency: UrgencySchema.nullable(),
  building: z.string(),
  unit: z.string(),
  status: WorkOrderStatusSchema,
  dispatchedAt: z.string(),
  completedAt: z.string().nullable(),
});
export type VendorJobSummary = z.infer<typeof VendorJobSummarySchema>;

export const VendorJobSchema = VendorJobSummarySchema.extend({
  description: z.string(),
  address: z.string(),
  entryPermission: EntryPermissionSchema,
  accessNotes: z.string().nullable(),
  photos: z.array(PhotoSchema),
  completionPhotos: z.array(PhotoSchema),
  completionNote: z.string().nullable(),
});
export type VendorJob = z.infer<typeof VendorJobSchema>;

export const CompleteJobSchema = z.object({
  note: z
    .string({ error: 'Describe what you did.' })
    .trim()
    .min(5, 'Describe what you did in at least 5 characters.')
    .max(1000, 'Keep the note under 1000 characters.'),
});
export type CompleteJobInput = z.infer<typeof CompleteJobSchema>;
