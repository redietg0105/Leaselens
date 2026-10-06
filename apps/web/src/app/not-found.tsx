import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { PublicHeader } from "@/components/public-header";

export const metadata: Metadata = { title: "Page not found · LeaseLens" };

export default function NotFound() {
  return (
    <>
      <PublicHeader />
      <main id="main-content" tabIndex={-1} className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-12 text-center">
        <h1 className="text-xl font-semibold">Page not found</h1>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          Back to start
        </Link>
      </main>
    </>
  );
}
