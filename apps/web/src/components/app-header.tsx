import Link from "next/link";
import { homePathForRole, type Me, type Role } from "@leaselens/shared";
import { SignOutButton } from "./sign-out-button";

const ROLE_LABEL: Record<Role, string> = {
  TENANT: "Tenant",
  VENDOR: "Vendor",
  COORDINATOR: "Coordinator",
  LEASING: "Leasing",
  MANAGER: "Manager",
};

/** Top bar for signed-in areas: who is signed in, and sign out. */
export function AppHeader({ user }: { user: Me }) {
  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href={homePathForRole(user.role)} className="shrink-0 font-semibold tracking-tight">
          LeaseLens
        </Link>
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0 text-right leading-tight">
            <p className="truncate text-sm font-medium" title={user.email}>
              {user.name}
            </p>
            <p className="text-xs text-muted-foreground">{ROLE_LABEL[user.role]}</p>
          </div>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
