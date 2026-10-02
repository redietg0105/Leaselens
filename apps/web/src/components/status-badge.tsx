import { TENANT_STATUS_LABEL, type WorkOrderStatus } from "@leaselens/shared";
import { cn } from "@/lib/utils";

const TONE: Record<WorkOrderStatus, string> = {
  SUBMITTED: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  NEEDS_INFO: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  TRIAGED: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200",
  NEEDS_REVIEW: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200",
  DISPATCHED: "bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200",
  IN_PROGRESS: "bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200",
  COMPLETED: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  CANCELLED: "bg-muted text-muted-foreground",
};

/** Tenant-facing status pill. The text carries the meaning; color is only a hint. */
export function StatusBadge({ status, className }: { status: WorkOrderStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE[status],
        className,
      )}
    >
      {TENANT_STATUS_LABEL[status]}
    </span>
  );
}
