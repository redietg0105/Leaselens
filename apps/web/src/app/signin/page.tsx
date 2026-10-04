import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DemoInfoSchema, homePathForRole, type DemoAccount } from "@leaselens/shared";
import { apiUrl } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";
import { SignInForm } from "./signin-form";

export const metadata: Metadata = { title: "Sign in · LeaseLens" };

/** Demo accounts if the API says demo mode is on (local only); otherwise — or if the API is down — none. */
async function demoAccounts(): Promise<DemoAccount[] | null> {
  try {
    const res = await fetch(apiUrl("/auth/demo"), { cache: "no-store" });
    if (!res.ok) return null;
    const info = DemoInfoSchema.safeParse(await res.json());
    return info.success && info.data.enabled ? ((info.data.accounts ?? []) as DemoAccount[]) : null;
  } catch {
    return null;
  }
}

export default async function SignInPage() {
  const user = await getCurrentUser();
  if (user) redirect(homePathForRole(user.role));
  const accounts = await demoAccounts();

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-12">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in to LeaseLens</h1>
        <p className="text-muted-foreground">
          Enter your email and we&apos;ll send you a sign-in link. No password needed.
        </p>
      </div>
      <SignInForm demoAccounts={accounts} />
    </main>
  );
}
