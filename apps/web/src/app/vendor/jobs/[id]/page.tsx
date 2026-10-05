import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, KeyRound, MapPin } from "lucide-react";
import { CATEGORY_SHORT, ENTRY_PERMISSION_LABEL, VendorJobSchema } from "@leaselens/shared";
import { UrgencyBadge } from "@/components/urgency-badge";
import { buttonVariants } from "@/components/ui/button";
import { apiUrl } from "@/lib/api";
import { ApiPhoto } from "@/components/api-photo";
import { formatDate } from "@/lib/format";
import { apiGet, requireArea } from "@/lib/session";
import { CompleteJobForm } from "./complete-form";

export const metadata: Metadata = { title: "Job · LeaseLens" };

/** Phrased for the technician (the tenant-facing labels speak to the tenant). */
const ENTRY_FOR_VENDOR = {
  YES: "You may enter if the tenant isn't home",
  NO: "Only enter when the tenant is home",
  CALL_FIRST: "Call the coordinator before entering",
} as const;

export default async function VendorJobPage({ params }: { params: Promise<{ id: string }> }) {
  await requireArea("/vendor");
  const { id } = await params;
  // The API answers 404 for a job assigned to another vendor → not-found page.
  const job = await apiGet(`/vendor/jobs/${encodeURIComponent(id)}`, VendorJobSchema);
  const photoGrid = (photos: typeof job.photos, label: string) => (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {photos.map((p, i) => (
        <li key={p.id} className="overflow-hidden rounded-lg border bg-muted">
          <a href={apiUrl(p.url)} target="_blank" rel="noopener noreferrer" aria-label={`Open ${label} ${i + 1} full size`}>
            <ApiPhoto src={apiUrl(p.url)} alt={`${label} ${i + 1}`} />
          </a>
        </li>
      ))}
    </ul>
  );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <Link href="/vendor/jobs" className={buttonVariants({ variant: "ghost", className: "-ml-2.5 self-start" })}>
        <ArrowLeft aria-hidden />
        My jobs
      </Link>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {job.completedAt ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-900 dark:bg-emerald-900 dark:text-emerald-50">
              <CheckCircle2 aria-hidden className="size-3.5" /> Completed
            </span>
          ) : (
            <UrgencyBadge urgency={job.urgency} />
          )}
          {job.category && <span className="text-sm text-muted-foreground">{CATEGORY_SHORT[job.category]}</span>}
          <span className="text-sm text-muted-foreground">Sent {formatDate(job.dispatchedAt)}</span>
        </div>
        <h1 className="text-xl font-semibold tracking-tight break-words">{job.summary}</h1>
      </header>

      <dl className="grid gap-4 rounded-lg border p-4 text-sm">
        <div className="flex gap-3">
          <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div>
            <dt className="text-muted-foreground">Where</dt>
            <dd className="font-medium">
              Unit {job.unit} · {job.building}
            </dd>
            <dd>{job.address}</dd>
          </div>
        </div>
        <div className="flex gap-3">
          <KeyRound aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div>
            <dt className="text-muted-foreground">Permission to enter</dt>
            <dd className="font-medium" title={ENTRY_PERMISSION_LABEL[job.entryPermission]}>
              {ENTRY_FOR_VENDOR[job.entryPermission]}
            </dd>
            {job.accessNotes && <dd className="mt-1 whitespace-pre-wrap break-words">Access notes: {job.accessNotes}</dd>}
          </div>
        </div>
      </dl>

      <section aria-labelledby="problem-heading" className="space-y-1">
        <h2 id="problem-heading" className="text-sm font-medium text-muted-foreground">
          What the tenant wrote
        </h2>
        <p className="whitespace-pre-wrap break-words">{job.description}</p>
      </section>

      <section aria-labelledby="photos-heading" className="space-y-2">
        <h2 id="photos-heading" className="text-sm font-medium text-muted-foreground">
          Photos
        </h2>
        {job.photos.length === 0 ? <p className="text-sm text-muted-foreground">No photos.</p> : photoGrid(job.photos, "Photo")}
      </section>

      {job.completedAt ? (
        <section aria-labelledby="done-heading" className="space-y-2 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm dark:border-emerald-800 dark:bg-emerald-950">
          <h2 id="done-heading" className="font-medium">
            Completed {formatDate(job.completedAt)}
          </h2>
          {job.completionNote && <p className="whitespace-pre-wrap break-words">{job.completionNote}</p>}
          {job.completionPhotos.length > 0 && photoGrid(job.completionPhotos, "Completion photo")}
        </section>
      ) : (
        <CompleteJobForm jobId={job.id} />
      )}
    </main>
  );
}
