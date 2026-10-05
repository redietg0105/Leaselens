import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ClipboardCheck, UserRoundSearch } from "lucide-react";
import {
  CATEGORY_LABEL,
  ENTRY_PERMISSION_LABEL,
  URGENCY_LABEL,
  WorkOrderDetailSchema,
} from "@leaselens/shared";
import { AutoRefresh } from "@/components/auto-refresh";
import { EmergencyAlert } from "@/components/emergency-alert";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { apiUrl } from "@/lib/api";
import { ApiPhoto } from "@/components/api-photo";
import { formatDate } from "@/lib/format";
import { apiGet, requireTenant } from "@/lib/session";
import { FollowUpForm } from "./follow-up-form";

export const metadata: Metadata = { title: "Request · LeaseLens" };

export default async function RequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireTenant();
  const { id } = await params;
  const { created } = await searchParams;
  // The API returns 404 for another tenant's request → the not-found page below.
  const request = await apiGet(`/work-orders/${encodeURIComponent(id)}`, WorkOrderDetailSchema);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <Link href="/tenant" className={buttonVariants({ variant: "ghost", className: "-ml-2.5 self-start" })}>
        <ArrowLeft aria-hidden />
        My requests
      </Link>

      {request.urgency === "EMERGENCY" && <EmergencyAlert rule={request.emergencyRule} />}

      {created === "1" && (
        <div role="status" className="flex gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
          <CheckCircle2 aria-hidden className="size-5 shrink-0" />
          <p>Request sent. We&apos;ll review it and let you know the next steps.</p>
        </div>
      )}

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={request.status} />
          <span className="text-sm text-muted-foreground">Sent {formatDate(request.createdAt)}</span>
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Maintenance request</h1>
      </header>

      {request.completion && (
        <section aria-labelledby="done-heading" className="space-y-1 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-50">
          <h2 id="done-heading" className="flex items-center gap-2 font-semibold">
            <CheckCircle2 aria-hidden className="size-5" />
            Completed {formatDate(request.completion.completedAt)}
          </h2>
          {request.completion.note && <p className="whitespace-pre-wrap break-words">Technician&apos;s note: {request.completion.note}</p>}
        </section>
      )}

      {request.status === "SUBMITTED" && <AutoRefresh />}

      {request.status === "NEEDS_INFO" && request.followUpQuestions.length > 0 && (
        <FollowUpForm requestId={request.id} questions={request.followUpQuestions} />
      )}

      {request.status === "NEEDS_REVIEW" && (
        <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4 text-sm">
          <UserRoundSearch aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <p>A coordinator will review your request shortly.</p>
        </div>
      )}

      {(request.category || request.urgency) && (
        <section aria-labelledby="assessment-heading" className="space-y-3 rounded-lg border p-4">
          <h2 id="assessment-heading" className="flex items-center gap-2 font-medium">
            <ClipboardCheck aria-hidden className="size-5 text-muted-foreground" />
            Our first look
          </h2>
          <dl className="grid gap-3 text-sm">
            {request.category && (
              <div>
                <dt className="text-muted-foreground">Type of problem</dt>
                <dd className="font-medium">
                  {CATEGORY_LABEL[request.category]}
                  {request.subIssue && <span className="block font-normal">{request.subIssue}</span>}
                </dd>
              </div>
            )}
            {request.urgency && (
              <div>
                <dt className="text-muted-foreground">How urgent</dt>
                <dd className="font-medium">{URGENCY_LABEL[request.urgency]}</dd>
              </div>
            )}
          </dl>
          <p className="text-xs text-muted-foreground">
            Suggested automatically and checked by our team. If it&apos;s wrong, we&apos;ll correct it.
          </p>
        </section>
      )}

      <section aria-labelledby="desc-heading" className="space-y-1">
        <h2 id="desc-heading" className="text-sm font-medium text-muted-foreground">
          Problem
        </h2>
        <p className="whitespace-pre-wrap break-words">{request.description}</p>
      </section>

      <section aria-labelledby="photos-heading" className="space-y-2">
        <h2 id="photos-heading" className="text-sm font-medium text-muted-foreground">
          Photos
        </h2>
        {request.photos.length === 0 ? (
          <p className="text-sm text-muted-foreground">No photos added.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {request.photos.map((photo, i) => (
              <li key={photo.id} className="overflow-hidden rounded-lg border bg-muted">
                <a href={apiUrl(photo.url)} target="_blank" rel="noopener noreferrer" aria-label={`Open photo ${i + 1} full size`}>
                  <ApiPhoto src={apiUrl(photo.url)} alt={`Photo ${i + 1} of the problem`} />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <dl className="grid gap-4 rounded-lg border p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Apartment</dt>
          <dd className="font-medium">
            {request.unit.number} · {request.unit.building}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Permission to enter</dt>
          <dd className="font-medium">{ENTRY_PERMISSION_LABEL[request.entryPermission]}</dd>
        </div>
        {request.answers.length > 0 && (
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Your answers</dt>
            <dd>
              <ul className="space-y-1">
                {request.answers.map((a) => (
                  <li key={a.questionId}>
                    {a.question} <span className="font-medium">{a.answer}</span>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
        {request.accessNotes && (
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Access notes</dt>
            <dd className="whitespace-pre-wrap break-words">{request.accessNotes}</dd>
          </div>
        )}
      </dl>
    </main>
  );
}
