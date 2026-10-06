"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Error boundary for the vendor area: friendly message and a retry that re-fetches. */
export default function VendorError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-12 text-center">
      <AlertTriangle aria-hidden className="size-10 text-destructive" />
      <h1 className="text-xl font-semibold">We couldn&apos;t load your jobs</h1>
      <p className="text-muted-foreground">Please try again. If it keeps happening, call the coordinator.</p>
      <Button className="h-11 w-full text-base" onClick={() => retry()}>
        Try again
      </Button>
    </main>
  );
}
