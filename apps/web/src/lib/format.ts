/** "Oct 2, 2026, 3:41 PM" in the pilot's time zone (Washington, DC). */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York",
  }).format(new Date(iso));
}

/** How long ago, short: "12 min", "5 h", "3 d". */
export function formatAge(iso: string, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

export const usd = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
