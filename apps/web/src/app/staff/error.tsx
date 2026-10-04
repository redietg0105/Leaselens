"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Error boundary for the staff app: friendly message and a retry that re-fetches. */
export default function StaffError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-12 text-center">
      <AlertTriangle aria-hidden className="size-10 text-destructive" />
      <h1 className="text-xl font-semibold">We couldn&apos;t load this page</h1>
      <p className="text-muted-foreground">Please try again. If the API is restarting this usually fixes itself within a minute.</p>
      <Button className="h-11 w-full text-base" onClick={() => retry()}>
        Try again
      </Button>
    </main>
  );
}
