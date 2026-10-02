import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { VerifyButton } from "./verify-button";

export const metadata: Metadata = { title: "Confirm sign-in · LeaseLens" };

/**
 * The emailed link opens this page. Signing in needs a click (a POST), so email security
 * scanners that open links automatically can't use up the one-time link.
 */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-12 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Confirm sign-in</h1>
      {typeof token === "string" && token.length > 0 ? (
        <>
          <p className="text-muted-foreground">Press the button to finish signing in to LeaseLens.</p>
          <VerifyButton token={token} />
        </>
      ) : (
        <>
          <p className="text-muted-foreground">This sign-in link is incomplete. Please request a new one.</p>
          <Link href="/signin" className={buttonVariants({ className: "h-11 w-full text-base" })}>
            Get a new link
          </Link>
        </>
      )}
    </main>
  );
}
