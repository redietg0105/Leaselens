import type { Metadata } from "next";
import { safeReturnPath } from "@leaselens/shared";
import { Reconnect } from "./reconnect";

export const metadata: Metadata = { title: "Reconnecting · LeaseLens" };

/** Shown when the web app can't reach the API (e.g. while it restarts). Reconnects on its own. */
export default async function UnavailablePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { next } = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-6 px-4 py-12 text-center">
      <Reconnect returnTo={safeReturnPath(next, "/")} />
    </main>
  );
}
