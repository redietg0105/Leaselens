import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Bot, Siren, UserRoundPen, Zap } from "lucide-react";
import {
  CATEGORY_SHORT,
  EMERGENCY_INSTRUCTIONS,
  ENTRY_PERMISSION_LABEL,
  STAFF_STATUS_LABEL,
  StaffWorkOrderSchema,
  VendorMatchSchema,
} from "@leaselens/shared";
import { UrgencyBadge } from "@/components/urgency-badge";
import { buttonVariants } from "@/components/ui/button";
import { apiUrl } from "@/lib/api";
import { formatDate, usd } from "@/lib/format";
import { apiGet, requireRoles } from "@/lib/session";
import { notFound } from "next/navigation";
import { OverrideForm } from "./override-form";
import { VendorPanel } from "./vendor-panel";

export const metadata: Metadata = { title: "Request · Staff · LeaseLens" };

const DISPATCHABLE = new Set(["SUBMITTED", "NEEDS_INFO", "TRIAGED", "NEEDS_REVIEW"]);

export default async function StaffWorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRoles("/staff", ["COORDINATOR", "MANAGER"]);
  if (!user) notFound();
  const { id } = await params;
  const w = await apiGet(`/staff/work-orders/${encodeURIComponent(id)}`, StaffWorkOrderSchema);
  const canDispatch = DISPATCHABLE.has(w.status) && w.dispatches.length === 0;
  const matches = canDispatch && w.category ? await apiGet(`/work-orders/${w.id}/vendors`, VendorMatchSchema.array()) : [];
  const closed = w.status === "COMPLETED" || w.status === "CANCELLED";

  const photoGrid = (photos: typeof w.photos, label: string) => (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {photos.map((p, i) => (
        <li key={p.id} className="overflow-hidden rounded-lg border bg-muted">
          <a href={apiUrl(p.url)} target="_blank" rel="noopener noreferrer" aria-label={`Open ${label} ${i + 1} full size`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- served by the API with the session cookie */}
            <img src={apiUrl(p.url)} alt={`${label} ${i + 1}`} loading="lazy" className="aspect-square size-full object-cover" />
          </a>
        </li>
      ))}
    </ul>
  );

  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_380px]">
      <div className="min-w-0 space-y-6">
        <Link href="/staff" className={buttonVariants({ variant: "ghost", className: "-ml-2.5" })}>
          <ArrowLeft aria-hidden />
          Queue
        </Link>

        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <UrgencyBadge urgency={w.urgency} />
            <span className="text-sm font-medium">{STAFF_STATUS_LABEL[w.status]}</span>
            {w.category && <span className="text-sm text-muted-foreground">{CATEGORY_SHORT[w.category]}</span>}
            {w.overridden ? (
              <span className="text-sm text-muted-foreground">Changed by staff</span>
            ) : (
              w.confidence !== null && <span className="text-sm text-muted-foreground">AI {Math.round(w.confidence * 100)}%</span>
            )}
          </div>
          <h1 className="text-xl font-semibold tracking-tight break-words">{w.subIssue ?? "Maintenance request"}</h1>
          <p className="text-sm text-muted-foreground">
            Unit {w.unit.number} ({w.unit.unitType}) · {w.unit.building} · received {formatDate(w.createdAt)}
            {w.slaDueAt && <> · respond by {formatDate(w.slaDueAt)}</>}
          </p>
        </header>

        {w.emergencyRule && (
          <div role="note" className="flex gap-3 rounded-lg border-2 border-red-600 bg-red-50 p-3 text-sm text-red-950 dark:bg-red-950 dark:text-red-50">
            <Siren aria-hidden className="size-5 shrink-0" />
            <p>
              <strong>Emergency rule matched: {EMERGENCY_INSTRUCTIONS[w.emergencyRule].title}</strong> (
              <code>{w.emergencyRule}</code>). Matched on the tenant&apos;s words, not by the AI.
            </p>
          </div>
        )}

        <section aria-labelledby="desc" className="space-y-1">
          <h2 id="desc" className="text-sm font-medium text-muted-foreground">Tenant&apos;s description</h2>
          <p className="whitespace-pre-wrap break-words">{w.description}</p>
        </section>

        <section aria-labelledby="summary" className="space-y-1">
          <h2 id="summary" className="text-sm font-medium text-muted-foreground">AI summary for the vendor</h2>
          <p className="break-words">{w.summaryForVendor ?? <span className="text-muted-foreground">No valid AI summary.</span>}</p>
        </section>

        <section aria-labelledby="photos" className="space-y-2">
          <h2 id="photos" className="text-sm font-medium text-muted-foreground">Photos</h2>
          {w.photos.length === 0 ? <p className="text-sm text-muted-foreground">No photos.</p> : photoGrid(w.photos, "Photo")}
        </section>

        <dl className="grid gap-3 rounded-lg border p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Permission to enter</dt>
            <dd className="font-medium">{ENTRY_PERMISSION_LABEL[w.entryPermission]}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Access notes</dt>
            <dd className="break-words">{w.accessNotes ?? "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Tenant&apos;s follow-up answers</dt>
            <dd>
              {w.answers.length === 0 ? (
                "—"
              ) : (
                <ul className="space-y-0.5">
                  {w.answers.map((a) => (
                    <li key={a.questionId}>
                      {a.question} <span className="font-medium">{a.answer}</span>
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
        </dl>

        {w.dispatches.length > 0 && (
          <section aria-labelledby="dispatches" className="space-y-2">
            <h2 id="dispatches" className="text-sm font-medium text-muted-foreground">Dispatch</h2>
            <ul className="space-y-2">
              {w.dispatches.map((d) => (
                <li key={d.id} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">
                    {d.vendor}{" "}
                    {d.autoDispatched ? (
                      <span className="ml-1 inline-flex items-center gap-1 rounded bg-sky-100 px-1.5 py-0.5 text-xs text-sky-900 dark:bg-sky-900 dark:text-sky-50">
                        <Zap aria-hidden className="size-3" /> Sent automatically
                      </span>
                    ) : (
                      <span className="text-muted-foreground">· approved by {d.approvedBy}</span>
                    )}
                  </p>
                  <p className="text-muted-foreground">
                    {formatDate(d.createdAt)}
                    {d.estimatedCostUsd !== null && <> · estimated {usd(d.estimatedCostUsd)}</>}
                  </p>
                  {d.matchReason && <p className="text-muted-foreground">{d.matchReason}</p>}
                  {d.completedAt && (
                    <p className="mt-1">
                      <strong>Completed {formatDate(d.completedAt)}:</strong> {d.completionNote}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            {w.completionPhotos.length > 0 && photoGrid(w.completionPhotos, "Completion photo")}
          </section>
        )}

        <section aria-labelledby="history" className="space-y-2">
          <h2 id="history" className="text-sm font-medium text-muted-foreground">Triage history</h2>
          {w.triageHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not triaged yet.</p>
          ) : (
            <ol className="space-y-2">
              {w.triageHistory.map((h) => (
                <li key={h.id} className="rounded-lg border p-3 text-sm">
                  <p className="flex flex-wrap items-center gap-2">
                    {h.kind === "override" ? (
                      <UserRoundPen aria-label="Human override" className="size-4" />
                    ) : (
                      <Bot aria-label="AI triage" className="size-4" />
                    )}
                    <span className="font-medium">
                      {h.kind === "override" ? `Changed by ${h.overriddenBy}` : h.valid ? "AI triage" : "AI triage failed"}
                    </span>
                    <span className="text-muted-foreground">{formatDate(h.createdAt)}</span>
                  </p>
                  <p className="mt-1">
                    {h.category ? CATEGORY_SHORT[h.category] : "No category"} · {h.urgency ?? "no urgency"}
                    {h.confidence !== null && <> · confidence {Math.round(h.confidence * 100)}%</>}
                    {h.emergencyRule && <> · rule {h.emergencyRule}</>}
                  </p>
                  {h.overrideReason && <p className="mt-1 italic">“{h.overrideReason}”</p>}
                  {h.error && <p className="mt-1 text-destructive">{h.error}</p>}
                  {h.kind === "ai" && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {h.model} · {h.promptVersion}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <aside className="space-y-6">
        {canDispatch && <VendorPanel workOrderId={w.id} hasCategory={!!w.category} matches={matches} />}
        {!closed && <OverrideForm workOrderId={w.id} category={w.category} urgency={w.urgency} />}
      </aside>
    </main>
  );
}
