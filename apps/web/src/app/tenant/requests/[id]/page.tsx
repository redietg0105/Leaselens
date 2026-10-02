import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { ENTRY_PERMISSION_LABEL, WorkOrderDetailSchema } from "@leaselens/shared";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { apiUrl } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { apiGet, requireTenant } from "@/lib/session";

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
                  {/* eslint-disable-next-line @next/next/no-img-element -- served by the API with the session cookie; next/image would fetch it without the cookie */}
                  <img
                    src={apiUrl(photo.url)}
                    alt={`Photo ${i + 1} of the problem`}
                    loading="lazy"
                    className="aspect-square size-full object-cover"
                  />
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
