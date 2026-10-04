import type { Urgency } from "@leaselens/shared";
import { cn } from "@/lib/utils";

const STYLE: Record<Urgency | "NONE", { label: string; className: string }> = {
  EMERGENCY: { label: "Emergency", className: "bg-red-600 text-white" },
  URGENT: { label: "Urgent", className: "bg-amber-100 text-amber-950 dark:bg-amber-900 dark:text-amber-50" },
  ROUTINE: { label: "Routine", className: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100" },
  NONE: { label: "Not set", className: "border border-dashed text-muted-foreground" },
};

/** Staff/vendor urgency pill. The word carries the meaning; color is only a hint. */
export function UrgencyBadge({ urgency, className }: { urgency: Urgency | null; className?: string }) {
  const s = STYLE[urgency ?? "NONE"];
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", s.className, className)}>
      {s.label}
    </span>
  );
}
