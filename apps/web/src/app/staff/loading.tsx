/** Shown while the queue loads. */
export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6" aria-busy="true">
      <span className="sr-only" role="status">
        Loading the queue…
      </span>
      <div className="h-8 w-32 animate-pulse rounded bg-muted" />
      <div className="divide-y rounded-lg border">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2 px-4 py-4">
            <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </main>
  );
}
