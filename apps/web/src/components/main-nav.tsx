"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@leaselens/shared";
import { cn } from "@/lib/utils";

const LINKS: Record<Role, { href: string; label: string }[]> = {
  TENANT: [
    { href: "/tenant", label: "My requests" },
    { href: "/tenant/requests/new", label: "New request" },
  ],
  VENDOR: [{ href: "/vendor/jobs", label: "My jobs" }],
  COORDINATOR: [{ href: "/staff", label: "Queue" }],
  MANAGER: [{ href: "/staff", label: "Queue" }],
  LEASING: [{ href: "/staff", label: "Lease tools" }],
};

/**
 * The area's main links. A client component so the current page (aria-current) stays right after
 * client-side navigation — the header itself is rendered once by the area layout.
 */
export function MainNav({ role }: { role: Role }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="mx-auto w-full max-w-5xl px-4 sm:px-6">
      <ul className="-mb-px flex gap-1">
        {LINKS[role].map(({ href, label }) => {
          const current = pathname === href;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset",
                  current ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
