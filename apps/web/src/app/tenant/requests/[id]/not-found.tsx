import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

/** Shown for a request that doesn't exist — or belongs to someone else (the API doesn't say which). */
export default function RequestNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-12 text-center">
      <h1 className="text-xl font-semibold">Request not found</h1>
      <p className="text-muted-foreground">It may have been removed, or the link is wrong.</p>
      <Link href="/tenant" className={buttonVariants({ className: "h-11 w-full text-base" })}>
        Back to my requests
      </Link>
    </main>
  );
}
