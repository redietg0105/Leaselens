import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { homePathForRole } from "@leaselens/shared";
import { getCurrentUser } from "@/lib/session";
import { SignInForm } from "./signin-form";

export const metadata: Metadata = { title: "Sign in · LeaseLens" };

export default async function SignInPage() {
  const user = await getCurrentUser();
  if (user) redirect(homePathForRole(user.role));

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-12">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in to LeaseLens</h1>
        <p className="text-muted-foreground">
          Enter your email and we&apos;ll send you a sign-in link. No password needed.
        </p>
      </div>
      <SignInForm />
    </main>
  );
}
