"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/api";

const INTERVAL_MS = 3000;
const MAX_TRIES = 40; // ~2 minutes, then wait for the user

/** Checks the API's /health every few seconds and returns to `returnTo` once it answers. */
export function Reconnect({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const [tries, setTries] = useState(0);
  const [checking, setChecking] = useState(false);
  const gaveUp = tries >= MAX_TRIES;

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch(apiUrl("/health"), { cache: "no-store" });
      if (res.ok) {
        router.replace(returnTo);
        router.refresh();
        return;
      }
    } catch {
      // still down
    }
    setChecking(false);
    setTries((n) => n + 1);
  }, [returnTo, router]);

  useEffect(() => {
    if (gaveUp) return;
    const timer = setTimeout(check, tries === 0 ? 500 : INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [tries, gaveUp, check]);

  return (
    <div className="flex flex-col items-center gap-4" role="status" aria-live="polite">
      <WifiOff aria-hidden className="size-10 text-muted-foreground" />
      <h1 className="text-xl font-semibold">
        {gaveUp ? "LeaseLens is unavailable" : "Reconnecting to LeaseLens…"}
      </h1>
      <p className="text-muted-foreground">
        {gaveUp
          ? "We still can't reach the server. Your requests are saved. Please try again in a few minutes."
          : "The server is starting or restarting. We'll take you back as soon as it's ready."}
      </p>
      <p className="text-sm text-muted-foreground">
        For an emergency like a gas smell, fire or flooding, call 911.
      </p>
      <Button
        className="h-11 w-full text-base"
        variant={gaveUp ? "default" : "outline"}
        disabled={checking}
        onClick={() => {
          setTries(0);
          void check();
        }}
      >
        {checking && <Loader2 aria-hidden className="animate-spin" />}
        {checking ? "Checking…" : "Try again now"}
      </Button>
    </div>
  );
}
