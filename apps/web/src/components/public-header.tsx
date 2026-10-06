import Link from "next/link";

/** Top bar for signed-out pages (landing, sign-in, confirm, reconnecting, not found). */
export function PublicHeader() {
  return (
    <header className="border-b">
      <nav aria-label="Main" className="mx-auto flex w-full max-w-5xl items-center px-4 sm:px-6">
        <Link href="/" className="inline-flex min-h-11 items-center font-semibold tracking-tight">
          LeaseLens
        </Link>
      </nav>
    </header>
  );
}
