import type { z } from 'zod';
import { LOWER_EMERGENCY_REASON_MIN, OverrideSchema, type OverrideInput } from './dispatch';
import type { Category, Urgency } from './enums';

/** The first message per field from a schema check — what a form shows next to each field after Submit. */
export function fieldErrors(schema: z.ZodType, values: unknown): Record<string, string> {
  const result = schema.safeParse(values);
  const errors: Record<string, string> = {};
  if (result.success) return errors;
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? '');
    errors[field] ??= issue.message;
  }
  return errors;
}

/**
 * Live re-check while typing, once a field has shown an error: each listed field that currently shows an
 * error gets the schema's current message, or none once its value is valid (so the message and the
 * field's aria-invalid disappear as soon as it's fixed). Fields without a shown error are left alone —
 * typing never shows a new error before Submit — and fields the schema doesn't check (e.g. photos) are kept.
 */
export function refreshShownErrors<K extends string>(
  shown: Partial<Record<K, string>>,
  schema: z.ZodType,
  values: unknown,
  fields: readonly K[],
): Partial<Record<K, string>> {
  const now = fieldErrors(schema, values);
  const next = { ...shown };
  for (const field of fields) {
    if (shown[field] === undefined) continue;
    if (now[field] === undefined) delete next[field];
    else next[field] = now[field];
  }
  return next;
}

export type OverrideField = 'category' | 'reason' | 'confirm';

export interface OverrideFormValues {
  /** The request's current values. */
  category: Category | null;
  urgency: Urgency | null;
  /** What the coordinator picked ("" = not set). */
  newCategory: Category | '';
  newUrgency: Urgency | '';
  reason: string;
  confirmLower: boolean;
}

/** True when the form would lower an EMERGENCY (needs a longer reason and a confirmation). */
export const lowersEmergency = (v: Pick<OverrideFormValues, 'urgency' | 'newUrgency'>) =>
  v.urgency === 'EMERGENCY' && v.newUrgency !== '' && v.newUrgency !== 'EMERGENCY';

/**
 * Checks the staff "Change category or urgency" form with the same rules as the API, and says which field
 * a problem belongs to (it gets aria-invalid and focus). Used on Submit, and again while the user edits
 * once an error is showing, so a fixed problem disappears straight away.
 */
export function checkOverrideForm(
  v: OverrideFormValues,
): { ok: true; data: OverrideInput } | { ok: false; message: string; field: OverrideField } {
  const lowering = lowersEmergency(v);
  const parsed = OverrideSchema.safeParse({
    category: v.newCategory && v.newCategory !== v.category ? v.newCategory : undefined,
    urgency: v.newUrgency && v.newUrgency !== v.urgency ? v.newUrgency : undefined,
    reason: v.reason,
    confirmLowerEmergency: lowering ? v.confirmLower : undefined,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    // "Nothing changed" has no field path; it's about the choices, so it belongs to the first one.
    return { ok: false, message: issue?.message ?? 'Check the form.', field: issue?.path[0] === 'reason' ? 'reason' : 'category' };
  }
  if (lowering && v.reason.trim().length < LOWER_EMERGENCY_REASON_MIN) {
    return { ok: false, message: `Lowering an emergency needs a reason of at least ${LOWER_EMERGENCY_REASON_MIN} characters.`, field: 'reason' };
  }
  if (lowering && !v.confirmLower) {
    return { ok: false, message: 'Tick the box to confirm you want to lower an emergency.', field: 'confirm' };
  }
  return { ok: true, data: parsed.data };
}
