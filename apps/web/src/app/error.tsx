"use client";

import { Button } from "@/components/ui/button";

/** App-wide error boundary: friendly message, no technical details. */
export default function Error({ retry }: { error: Error; retry: () => void }) {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-12 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground">
        Please try again. If the problem continues, contact the office.
      </p>
      <Button onClick={() => retry()}>Try again</Button>
    </main>
  );
}
