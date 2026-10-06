import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { requireTenant } from "@/lib/session";
import { NewRequestForm } from "./new-request-form";

export const metadata: Metadata = { title: "New request · LeaseLens" };

export default async function NewRequestPage() {
  await requireTenant();

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <Link href="/tenant" className={buttonVariants({ variant: "ghost", className: "-ml-2.5 self-start" })}>
        <ArrowLeft aria-hidden />
        My requests
      </Link>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">New request</h1>
        <p className="text-sm text-muted-foreground">
          Tell us what&apos;s wrong in your apartment. <strong className="text-foreground">Emergency?</strong> If you
          smell gas, see fire or smoke, or water is pouring in, leave the area and call 911 first.
        </p>
      </div>
      <NewRequestForm />
    </main>
  );
}
