"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Truck } from "lucide-react";
import type { VendorMatch } from "@leaselens/shared";
import { Button } from "@/components/ui/button";
import { apiPost, ApiError } from "@/lib/api";
import { usd } from "@/lib/format";

/** Top vendor matches with one-click approval. The approver is recorded by the server from the session. */
export function VendorPanel({
  workOrderId,
  hasCategory,
  matches,
}: {
  workOrderId: string;
  hasCategory: boolean;
  matches: VendorMatch[];
}) {
  const router = useRouter();
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function approve(vendorId: string) {
    setSending(vendorId);
    setError(null);
    try {
      await apiPost(`/work-orders/${workOrderId}/dispatch`, { vendorId });
      // The panel goes away; the page focuses the new Dispatch section (?dispatched=1).
      router.replace(`/staff/work-orders/${workOrderId}?dispatched=1`, { scroll: false });
    } catch (err) {
      setSending(null);
      setError(err instanceof ApiError ? err.message : "Couldn't dispatch. Please try again.");
    }
  }

  return (
    <section aria-labelledby="vendors-heading" className="space-y-3 rounded-lg border p-4">
      <h2 id="vendors-heading" className="flex items-center gap-2 font-semibold">
        <Truck aria-hidden className="size-5" />
        Suggested vendors
      </h2>
      {!hasCategory ? (
        <p className="text-sm text-muted-foreground">Set a category below to see vendors with the right trade.</p>
      ) : matches.length === 0 ? (
        <p className="text-sm text-muted-foreground">No vendor has this trade. Add one, or change the category.</p>
      ) : (
        <ol className="space-y-3">
          {matches.map((m, i) => (
            <li key={m.vendorId} className="space-y-2 rounded-lg border p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-medium">
                  {i + 1}. {m.name}
                </p>
                <span className="text-sm tabular-nums">{usd(m.estimatedCostUsd)}</span>
              </div>
              <p className="text-xs text-muted-foreground">{m.reason}</p>
              <Button
                className="h-10 w-full"
                variant={i === 0 ? "default" : "outline"}
                disabled={sending !== null}
                onClick={() => approve(m.vendorId)}
              >
                {sending === m.vendorId && <Loader2 aria-hidden className="animate-spin" />}
                {sending === m.vendorId ? "Dispatching…" : `Approve ${m.name}`}
              </Button>
            </li>
          ))}
        </ol>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
