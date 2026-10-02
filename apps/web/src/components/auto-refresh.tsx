"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * While the AI is reviewing a request, re-fetch the page every few seconds so the result appears
 * on its own. Stops after about a minute and offers a manual refresh instead.
 */
export function AutoRefresh({ intervalMs = 3000, maxTries = 20 }: { intervalMs?: number; maxTries?: number }) {
  const router = useRouter();
  const [tries, setTries] = useState(0);
  const gaveUp = tries >= maxTries;

  useEffect(() => {
    if (gaveUp) return;
    const timer = setTimeout(() => {
      setTries((n) => n + 1);
      router.refresh();
    }, intervalMs);
    return () => clearTimeout(timer);
  }, [tries, gaveUp, intervalMs, router]);

  return (
    <div role="status" className="flex items-center gap-3 rounded-lg border bg-muted/40 p-4 text-sm">
      {gaveUp ? (
        <>
          <p className="flex-1">This is taking longer than usual. Your request is saved.</p>
          <button
            type="button"
            onClick={() => setTries(0)}
            className="shrink-0 rounded-md px-3 py-2 font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            Check again
          </button>
        </>
      ) : (
        <>
          <Loader2 aria-hidden className="size-5 shrink-0 animate-spin text-muted-foreground" />
          <p>We&apos;re reviewing your request. This usually takes a few seconds.</p>
        </>
      )}
    </div>
  );
}
