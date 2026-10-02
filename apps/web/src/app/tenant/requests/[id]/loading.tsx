/** Shown while a request loads. */
export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6" aria-busy="true">
      <span className="sr-only" role="status">
        Loading request…
      </span>
      <div className="h-8 w-32 animate-pulse rounded bg-muted" />
      <div className="h-6 w-48 animate-pulse rounded bg-muted" />
      <div className="space-y-2">
        <div className="h-4 w-full animate-pulse rounded bg-muted" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="aspect-square animate-pulse rounded-lg bg-muted" />
        <div className="aspect-square animate-pulse rounded-lg bg-muted" />
      </div>
    </main>
  );
}
