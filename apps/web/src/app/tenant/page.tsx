import type { Metadata } from "next";
import Link from "next/link";
import { Camera, ChevronRight, ClipboardList, Plus } from "lucide-react";
import { WorkOrderSummarySchema } from "@leaselens/shared";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { apiGet, requireArea } from "@/lib/session";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "My requests · LeaseLens" };

export default async function TenantHome() {
  await requireArea("/tenant");

  const requests = await apiGet("/work-orders/mine", WorkOrderSummarySchema.array());

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">My requests</h1>
        {requests.length > 0 && (
          <Link href="/tenant/requests/new" className={buttonVariants({ size: "lg", className: "h-10" })}>
            <Plus aria-hidden />
            New request
          </Link>
        )}
      </div>

      {requests.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed px-6 py-12 text-center">
          <ClipboardList aria-hidden className="size-10 text-muted-foreground" />
          <div className="space-y-1">
            <h2 className="font-medium">No requests yet</h2>
            <p className="text-sm text-muted-foreground">
              Something broken or not working? Tell us and add a photo.
            </p>
          </div>
          <Link href="/tenant/requests/new" className={buttonVariants({ className: "h-11 w-full text-base sm:w-auto" })}>
            <Plus aria-hidden />
            Report a problem
          </Link>
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-lg border">
          {requests.map((r) => (
            <li key={r.id}>
              <Link
                href={`/tenant/requests/${r.id}`}
                className="flex items-center gap-3 px-4 py-3 outline-none hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="line-clamp-2 text-sm font-medium break-words">{r.description}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <StatusBadge status={r.status} />
                    <span>{formatDate(r.createdAt)}</span>
                    {r.photoCount > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Camera aria-hidden className="size-3.5" />
                        {r.photoCount} {r.photoCount === 1 ? "photo" : "photos"}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
