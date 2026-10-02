import { Siren } from "lucide-react";
import { EMERGENCY_INSTRUCTIONS, type EmergencyRuleId } from "@leaselens/shared";

/**
 * Shown at the top of an emergency request. A rule match shows its specific steps immediately
 * (before any AI runs); an emergency raised by triage shows the general steps.
 */
export function EmergencyAlert({ rule }: { rule: EmergencyRuleId | null }) {
  const info = rule ? EMERGENCY_INSTRUCTIONS[rule] : null;
  return (
    <section
      role="alert"
      aria-labelledby="emergency-title"
      className="space-y-3 rounded-lg border-2 border-red-600 bg-red-50 p-4 text-red-950 dark:border-red-500 dark:bg-red-950 dark:text-red-50"
    >
      <div className="flex items-start gap-3">
        <Siren aria-hidden className="mt-0.5 size-6 shrink-0" />
        <div className="space-y-1">
          <h2 id="emergency-title" className="text-lg font-semibold leading-tight">
            Emergency{info ? `: ${info.title}` : ""}
          </h2>
          <p className="text-sm">Our on-call team has been alerted. If anyone is in danger, call 911 now.</p>
        </div>
      </div>
      <ol className="list-decimal space-y-1 pl-6 text-sm font-medium">
        {(info?.steps ?? [
          "If anyone is in danger, leave the apartment and call 911.",
          "Stay somewhere safe and keep your phone with you so our team can reach you.",
        ]).map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <a
        href="tel:911"
        className="flex h-11 w-full items-center justify-center rounded-lg bg-red-700 text-base font-semibold text-white hover:bg-red-800 focus-visible:ring-3 focus-visible:ring-red-400 focus-visible:outline-none"
      >
        Call 911
      </a>
    </section>
  );
}
