/** "Oct 2, 2026, 3:41 PM" in the pilot's time zone (Washington, DC). */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York",
  }).format(new Date(iso));
}
