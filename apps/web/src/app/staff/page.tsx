import type { Metadata } from "next";
import Link from "next/link";
import { Camera, Inbox, Siren, Zap } from "lucide-react";
import {
  CATEGORY_SHORT,
  QueueFilterSchema,
  QueueItemSchema,
  STAFF_STATUS_LABEL,
  WorkOrderStatusSchema,
  type QueueItem,
} from "@leaselens/shared";
import { PlaceholderPage } from "@/components/placeholder-page";
import { UrgencyBadge } from "@/components/urgency-badge";
import { buttonVariants } from "@/components/ui/button";
import { formatAge } from "@/lib/format";
import { apiGet, getCurrentUser, requireRoles } from "@/lib/session";
import { cn } from "@/lib/utils";

/** The page title says what this role actually sees (leasing staff get the lease tools placeholder). */
export async function generateMetadata(): Promise<Metadata> {
  const user = await getCurrentUser();
  return { title: user?.role === "LEASING" ? "Lease tools · LeaseLens" : "Triage queue · LeaseLens" };
}

const URGENCY_OPTIONS = [
  ["", "All urgencies"],
  ["EMERGENCY", "Emergency"],
  ["URGENT", "Urgent"],
  ["NONE", "Not set yet"],
  ["ROUTINE", "Routine"],
] as const;

const confidenceText = (c: number | null) => (c === null ? "—" : `${Math.round(c * 100)}%`);
// Shown instead of the AI confidence once a person has changed the category or urgency.
const CHANGED_BY_STAFF = "Changed by staff";

export default async function StaffHome({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireRoles("/staff", ["COORDINATOR", "MANAGER"]);
  if (!user) {
    return (
      <PlaceholderPage
        title="Lease tools"
        description="Lease upload, term verification and lease questions will appear here."
      />
    );
  }

  const raw = await searchParams;
  // Ignore unknown filter values instead of failing.
  const filter = QueueFilterSchema.safeParse({
    urgency: typeof raw.urgency === "string" && raw.urgency ? raw.urgency : undefined,
    status: typeof raw.status === "string" && raw.status ? raw.status : undefined,
  });
  const active = filter.success ? filter.data : {};
  const query = new URLSearchParams(Object.entries(active).filter(([, v]) => v) as [string, string][]).toString();
  const items = await apiGet(`/staff/queue${query ? `?${query}` : ""}`, QueueItemSchema.array());
  const filtered = Boolean(active.urgency || active.status);

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Triage queue</h1>
          <p className="text-sm text-muted-foreground">Open requests — emergencies first, then oldest first.</p>
        </div>
        <form method="get" className="flex flex-wrap items-end gap-2" aria-label="Filter the queue">
          <div className="grid gap-1">
            <label htmlFor="filter-urgency" className="text-xs font-medium">
              Urgency
            </label>
            <select id="filter-urgency" name="urgency" defaultValue={active.urgency ?? ""} className="h-9 rounded-lg border border-input bg-background px-2 text-sm max-sm:min-h-11">
              {URGENCY_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <label htmlFor="filter-status" className="text-xs font-medium">
              Status
            </label>
            <select id="filter-status" name="status" defaultValue={active.status ?? ""} className="h-9 rounded-lg border border-input bg-background px-2 text-sm max-sm:min-h-11">
              <option value="">All open</option>
              {WorkOrderStatusSchema.options
                .filter((s) => s !== "COMPLETED" && s !== "CANCELLED")
                .map((s) => (
                  <option key={s} value={s}>
                    {STAFF_STATUS_LABEL[s]}
                  </option>
                ))}
            </select>
          </div>
          <button type="submit" className={buttonVariants({ size: "lg", className: "h-9" })}>
            Filter
          </button>
          {filtered && (
            <Link href="/staff" className={buttonVariants({ variant: "ghost", size: "lg", className: "h-9" })}>
              Clear
            </Link>
          )}
        </form>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center">
          <Inbox aria-hidden className="size-10 text-muted-foreground" />
          <h2 className="font-medium">{filtered ? "Nothing matches these filters" : "No open requests"}</h2>
          <p className="text-sm text-muted-foreground">
            {filtered ? "Try another urgency or status." : "New tenant requests will appear here."}
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {items.length} open {items.length === 1 ? "request" : "requests"}
          </p>
          {/* Phones: cards */}
          <ul className="grid grid-cols-1 gap-2 md:hidden">
            {items.map((i) => (
              <li key={i.id}>
                <Link href={`/staff/work-orders/${i.id}`} className={cn("block rounded-lg border p-3", rowTone(i))}>
                  <div className="flex flex-wrap items-center gap-2">
                    <UrgencyBadge urgency={i.urgency} />
                    <span className="text-xs font-medium">{STAFF_STATUS_LABEL[i.status]}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{formatAge(i.createdAt)}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm font-medium break-words">{i.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {i.unit} · {i.building} · {i.category ? CATEGORY_SHORT[i.category] : "No category"} ·{" "}
                    {i.overridden ? CHANGED_BY_STAFF : `AI ${confidenceText(i.confidence)}`} · {i.photoCount} photo
                    {i.photoCount === 1 ? "" : "s"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          {/* Desktop: table. `relative` keeps the sr-only header text inside the scroll box, so a wide
              table scrolls here instead of making the whole page scroll sideways. */}
          <div className="relative hidden overflow-x-auto rounded-lg border md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Urgency</th>
                  <th scope="col" className="px-3 py-2 font-medium">Request</th>
                  <th scope="col" className="px-3 py-2 font-medium">Unit</th>
                  <th scope="col" className="px-3 py-2 font-medium">Category</th>
                  <th scope="col" className="px-3 py-2 font-medium">AI confidence</th>
                  <th scope="col" className="px-3 py-2 font-medium">Status</th>
                  <th scope="col" className="px-3 py-2 font-medium">Age</th>
                  <th scope="col" className="px-3 py-2 font-medium"><span className="sr-only">Photos</span><Camera aria-hidden className="size-4" /></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((i) => (
                  <tr key={i.id} className={cn("hover:bg-muted/40", rowTone(i))}>
                    <td className="px-3 py-2 align-top">
                      <div className="flex items-center gap-1">
                        <UrgencyBadge urgency={i.urgency} />
                        {i.emergencyRule && <Siren aria-label={`Emergency rule: ${i.emergencyRule}`} className="size-4 text-red-600" />}
                      </div>
                    </td>
                    <td className="max-w-md px-3 py-2 align-top">
                      <Link href={`/staff/work-orders/${i.id}`} className="line-clamp-2 font-medium break-words underline-offset-4 hover:underline">
                        {i.description}
                      </Link>
                    </td>
                    <td className="px-3 py-2 align-top whitespace-nowrap">
                      {i.unit}
                      <span className="block text-xs text-muted-foreground">{i.building.replace(/ — .*/, "")}</span>
                    </td>
                    <td className="px-3 py-2 align-top">{i.category ? CATEGORY_SHORT[i.category] : <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2 align-top tabular-nums">
                      {i.overridden ? <span className="whitespace-nowrap">{CHANGED_BY_STAFF}</span> : confidenceText(i.confidence)}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span className="inline-flex items-center gap-1 whitespace-nowrap">
                        {STAFF_STATUS_LABEL[i.status]}
                        {i.autoDispatched && (
                          <span title="Sent to the vendor automatically" className="inline-flex items-center gap-0.5 rounded bg-sky-100 px-1 text-[11px] text-sky-900 dark:bg-sky-900 dark:text-sky-50">
                            <Zap aria-hidden className="size-3" />
                            auto
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top whitespace-nowrap text-muted-foreground">{formatAge(i.createdAt)}</td>
                    <td className="px-3 py-2 align-top tabular-nums">{i.photoCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}

/** Rows that need a human get a subtle highlight. */
function rowTone(i: QueueItem): string {
  if (i.urgency === "EMERGENCY") return "bg-red-50/60 dark:bg-red-950/30";
  if (i.status === "NEEDS_REVIEW") return "bg-amber-50/60 dark:bg-amber-950/30";
  return "";
}
