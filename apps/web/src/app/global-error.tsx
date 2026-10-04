"use client";

import "./globals.css";

/**
 * Last-resort error page for crashes in the root layout itself (every other area has its own
 * error.tsx). It replaces the whole document, so it renders its own <html> and <body>.
 */
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-xl font-semibold">LeaseLens hit a problem</h1>
        <p className="max-w-sm text-muted-foreground">
          Please try again. If you have an emergency like a gas smell, fire or flooding, call 911.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          className="h-11 rounded-lg bg-primary px-6 text-base font-medium text-primary-foreground"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
