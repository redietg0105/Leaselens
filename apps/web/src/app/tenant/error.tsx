"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Error boundary for the tenant area: friendly message and a retry that re-fetches. */
export default function TenantError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-12 text-center">
      <AlertTriangle aria-hidden className="size-10 text-destructive" />
      <h1 className="text-xl font-semibold">We couldn&apos;t load this page</h1>
      <p className="text-muted-foreground">
        Please try again. If you have an emergency like a gas smell, fire or flooding, call 911.
      </p>
      <Button className="h-11 w-full text-base" onClick={() => retry()}>
        Try again
      </Button>
    </main>
  );
}
