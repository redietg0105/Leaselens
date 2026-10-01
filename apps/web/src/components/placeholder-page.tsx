import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

/** Temporary page shown until an area of the app is built. */
export function PlaceholderPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6">
      <Link
        href="/"
        className={buttonVariants({ variant: "ghost", className: "self-start" })}
      >
        <ArrowLeft aria-hidden />
        Back to start
      </Link>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Coming soon.
      </p>
    </main>
  );
}
