"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PencilLine } from "lucide-react";
import {
  CATEGORY_SHORT,
  CategorySchema,
  LOWER_EMERGENCY_REASON_MIN,
  OverrideSchema,
  UrgencySchema,
  type Category,
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
  const [saving, setSaving] = useState(false);

  const lowersEmergency = urgency === "EMERGENCY" && newUrgency !== "" && newUrgency !== "EMERGENCY";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const parsed = OverrideSchema.safeParse({
      category: newCategory && newCategory !== category ? newCategory : undefined,
      urgency: newUrgency && newUrgency !== urgency ? newUrgency : undefined,
      reason,
      confirmLowerEmergency: lowersEmergency ? confirmLower : undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form.");
      return;
    }
    if (lowersEmergency && reason.trim().length < LOWER_EMERGENCY_REASON_MIN) {
      setError(`Lowering an emergency needs a reason of at least ${LOWER_EMERGENCY_REASON_MIN} characters.`);
      return;
    }
    if (lowersEmergency && !confirmLower) {
      setError("Tick the box to confirm you want to lower an emergency.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiPost(`/work-orders/${workOrderId}/override`, parsed.data);
      setReason("");
      setConfirmLower(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the change. Please try again.");
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
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value as Category)}
            disabled={saving}
            className="h-9 rounded-lg border bg-background px-2 text-sm"
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
            onChange={(e) => setNewUrgency(e.target.value as Urgency)}
            disabled={saving}
            className="h-9 rounded-lg border bg-background px-2 text-sm"
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
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
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
              checked={confirmLower}
              onChange={(e) => setConfirmLower(e.target.checked)}
              disabled={saving}
              className="mt-0.5 size-4"
            />
            I confirm this is no longer an emergency.
          </label>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="h-10 w-full" variant={lowersEmergency ? "destructive" : "default"} disabled={saving}>
        {saving && <Loader2 aria-hidden className="animate-spin" />}
        {saving ? "Saving…" : "Save change"}
      </Button>
    </form>
  );
}
