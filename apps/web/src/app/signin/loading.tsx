/** Shown while the sign-in page checks for an existing session and demo mode (both ask the API). */
export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-12" aria-busy="true">
      <span className="sr-only" role="status">
        Loading…
      </span>
      <div className="mx-auto h-8 w-56 animate-pulse rounded bg-muted" />
      <div className="mx-auto h-4 w-64 animate-pulse rounded bg-muted" />
      <div className="space-y-3">
        <div className="h-4 w-16 animate-pulse rounded bg-muted" />
        <div className="h-11 w-full animate-pulse rounded-lg bg-muted" />
        <div className="h-11 w-full animate-pulse rounded-lg bg-muted" />
      </div>
    </main>
  );
}
