import type { Metadata } from "next";
import Link from "next/link";
import { BriefcaseBusiness, CheckCircle2, ChevronRight } from "lucide-react";
import { CATEGORY_SHORT, VendorJobSummarySchema } from "@leaselens/shared";
import { UrgencyBadge } from "@/components/urgency-badge";
import { formatDate } from "@/lib/format";
import { apiGet, requireArea } from "@/lib/session";

export const metadata: Metadata = { title: "My jobs · LeaseLens" };

export default async function VendorJobsPage() {
  await requireArea("/vendor");
  const jobs = await apiGet("/vendor/jobs", VendorJobSummarySchema.array());
  const open = jobs.filter((j) => !j.completedAt);
  const done = jobs.filter((j) => j.completedAt);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">My jobs</h1>

      {jobs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center">
          <BriefcaseBusiness aria-hidden className="size-10 text-muted-foreground" />
          <h2 className="font-medium">No jobs yet</h2>
          <p className="text-sm text-muted-foreground">New jobs from LeaseLens will appear here.</p>
        </div>
      ) : (
        <>
          <JobList title={`Open (${open.length})`} jobs={open} empty="Nothing open right now." />
          {done.length > 0 && <JobList title={`Completed (${done.length})`} jobs={done} empty="" />}
        </>
      )}
    </main>
  );
}

function JobList({
  title,
  jobs,
  empty,
}: {
  title: string;
  jobs: ReturnType<typeof VendorJobSummarySchema.parse>[];
  empty: string;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      {jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {jobs.map((j) => (
            <li key={j.id}>
              <Link
                href={`/vendor/jobs/${j.id}`}
                className="flex items-center gap-3 px-4 py-3 outline-none hover:bg-muted/50 focus-visible:bg-muted/50"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="line-clamp-2 text-sm font-medium break-words">{j.summary}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {j.completedAt ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                        <CheckCircle2 aria-hidden className="size-3.5" /> Completed
                      </span>
                    ) : (
                      <UrgencyBadge urgency={j.urgency} />
                    )}
                    <span>
                      {j.unit} · {j.building}
                    </span>
                    {j.category && <span>{CATEGORY_SHORT[j.category]}</span>}
                    <span>Sent {formatDate(j.dispatchedAt)}</span>
                  </div>
                </div>
                <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
