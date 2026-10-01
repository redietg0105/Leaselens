import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-12 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        Back to start
      </Link>
    </main>
  );
}
