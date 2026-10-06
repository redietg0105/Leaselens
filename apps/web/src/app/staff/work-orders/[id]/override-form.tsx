"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, PencilLine } from "lucide-react";
import {
  CATEGORY_SHORT,
  CategorySchema,
  checkOverrideForm,
  LOWER_EMERGENCY_REASON_MIN,
  lowersEmergency as lowersEmergencyCheck,
  UrgencySchema,
  type Category,
  type OverrideField,
  type OverrideFormValues,
  type Urgency,
} from "@leaselens/shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiPost, ApiError } from "@/lib/api";

const URGENCY_WORD: Record<Urgency, string> = { EMERGENCY: "Emergency", URGENT: "Urgent", ROUTINE: "Routine" };

/** Coordinator changes category or urgency with a required reason. The server records who did it. */
export function OverrideForm({
  workOrderId,
  category,
  urgency,
}: {
  workOrderId: string;
  category: Category | null;
  urgency: Urgency | null;
}) {
  const router = useRouter();
  const [newCategory, setNewCategory] = useState<Category | "">(category ?? "");
  const [newUrgency, setNewUrgency] = useState<Urgency | "">(urgency ?? "");
  const [reason, setReason] = useState("");
  const [confirmLower, setConfirmLower] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which field the error is about: it gets aria-invalid, points at the message, and takes focus.
  const [errorField, setErrorField] = useState<OverrideField | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const savedRef = useRef<HTMLParagraphElement>(null);

  function fail(message: string, field: OverrideField | null) {
    setError(message);
    setErrorField(field);
    setSaved(false);
    const target = field === "category" ? categoryRef : field === "reason" ? reasonRef : field === "confirm" ? confirmRef : null;
    target?.current?.focus();
  }
  const invalid = (field: OverrideField) =>
    errorField === field ? ({ "aria-invalid": true, "aria-describedby": "override-error" } as const) : {};

  const lowersEmergency = lowersEmergencyCheck({ urgency, newUrgency });
  const values = (changed: Partial<OverrideFormValues> = {}): OverrideFormValues => ({
    category,
    urgency,
    newCategory,
    newUrgency,
    reason,
    confirmLower,
    ...changed,
  });

  /**
   * Once a field shows an error, re-check as the coordinator edits (same rules as Submit): a fixed problem
   * disappears straight away, a remaining one updates its message. Errors from the server are left as they are.
   */
  function recheck(changed: Partial<OverrideFormValues>) {
    if (!errorField) return;
    const result = checkOverrideForm(values(changed));
    if (result.ok) {
      setError(null);
      setErrorField(null);
    } else {
      setError(result.message);
      setErrorField(result.field);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const checked = checkOverrideForm(values());
    if (!checked.ok) {
      fail(checked.message, checked.field);
      return;
    }
    setSaving(true);
    setError(null);
    setErrorField(null);
    try {
      await apiPost(`/work-orders/${workOrderId}/override`, checked.data);
      setReason("");
      setConfirmLower(false);
      setSaved(true);
      router.refresh();
      // The new entry appears in the history; focus the confirmation so it's announced and the user knows.
      requestAnimationFrame(() => savedRef.current?.focus());
    } catch (err) {
      fail(err instanceof ApiError ? err.message : "Couldn't save the change. Please try again.", null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-3 rounded-lg border p-4" aria-labelledby="override-heading">
      <h2 id="override-heading" className="flex items-center gap-2 font-semibold">
        <PencilLine aria-hidden className="size-5" />
        Change category or urgency
      </h2>
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1">
          <label htmlFor="override-category" className="text-xs font-medium">
            Category
          </label>
          <select
            id="override-category"
            ref={categoryRef}
            {...invalid("category")}
            value={newCategory}
            onChange={(e) => {
              setNewCategory(e.target.value as Category);
              recheck({ newCategory: e.target.value as Category });
            }}
            disabled={saving}
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm max-sm:min-h-11"
          >
            {!category && <option value="">Not set</option>}
            {CategorySchema.options.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_SHORT[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <label htmlFor="override-urgency" className="text-xs font-medium">
            Urgency
          </label>
          <select
            id="override-urgency"
            value={newUrgency}
            onChange={(e) => {
              setNewUrgency(e.target.value as Urgency);
              recheck({ newUrgency: e.target.value as Urgency });
            }}
            disabled={saving}
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm max-sm:min-h-11"
          >
            {!urgency && <option value="">Not set</option>}
            {UrgencySchema.options.map((u) => (
              <option key={u} value={u}>
                {URGENCY_WORD[u]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-1">
        <Label htmlFor="override-reason">Reason (required)</Label>
        <Textarea
          id="override-reason"
          ref={reasonRef}
          {...invalid("reason")}
          rows={3}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            recheck({ reason: e.target.value });
          }}
          disabled={saving}
          placeholder="e.g. Photo shows water reaching the outlet."
        />
      </div>
      {lowersEmergency && (
        <div className="space-y-2 rounded-lg border-2 border-red-600 bg-red-50 p-3 text-sm text-red-950 dark:bg-red-950 dark:text-red-50">
          <p className="font-medium">You are lowering an emergency.</p>
          <p>
            This is logged and on-call is notified. Explain why it&apos;s safe (at least {LOWER_EMERGENCY_REASON_MIN} characters).
          </p>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              ref={confirmRef}
              {...invalid("confirm")}
              checked={confirmLower}
              onChange={(e) => {
                setConfirmLower(e.target.checked);
                recheck({ confirmLower: e.target.checked });
              }}
              disabled={saving}
              className="mt-0.5 size-4"
            />
            I confirm this is no longer an emergency.
          </label>
        </div>
      )}
      {error && (
        <p id="override-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {saved && !error && (
        <p ref={savedRef} tabIndex={-1} role="status" className="flex items-center gap-2 text-sm font-medium text-green-800 outline-none">
          <CheckCircle2 aria-hidden className="size-4" />
          Change saved. It&apos;s at the top of the triage history.
        </p>
      )}
      <Button type="submit" className="h-10 w-full" variant={lowersEmergency ? "destructive" : "default"} disabled={saving}>
        {saving && <Loader2 aria-hidden className="animate-spin" />}
        {saving ? "Saving…" : "Save change"}
      </Button>
    </form>
  );
}
