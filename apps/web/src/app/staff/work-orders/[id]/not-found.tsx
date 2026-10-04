import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function StaffRequestNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-12 text-center">
      <h1 className="text-xl font-semibold">Request not found</h1>
      <p className="text-muted-foreground">It may have been removed, or the link is wrong.</p>
      <Link href="/staff" className={buttonVariants({ className: "h-11 w-full text-base" })}>
        Back to the queue
      </Link>
    </main>
  );
}
