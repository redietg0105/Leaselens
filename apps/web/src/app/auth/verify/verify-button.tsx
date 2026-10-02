"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { VerifyLinkResponse } from "@leaselens/shared";
import { Button, buttonVariants } from "@/components/ui/button";
import { apiPost, ApiError } from "@/lib/api";

type State = { kind: "idle" } | { kind: "verifying" } | { kind: "done" } | { kind: "error"; message: string; linkDead: boolean };

export function VerifyButton({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });

  async function onClick() {
    setState({ kind: "verifying" });
    try {
      const { redirectTo } = await apiPost<VerifyLinkResponse>("/auth/verify", { token });
      setState({ kind: "done" });
      router.replace(redirectTo);
      router.refresh();
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      setState({
        kind: "error",
        message: apiErr?.message ?? "Something went wrong.",
        linkDead: apiErr?.status === 400,
      });
    }
  }

  if (state.kind === "error" && state.linkDead) {
    return (
      <div className="space-y-4">
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
        <Link href="/signin" className={buttonVariants({ className: "h-11 w-full text-base" })}>
          Get a new link
        </Link>
      </div>
    );
  }

  const busy = state.kind === "verifying" || state.kind === "done";
  return (
    <div className="space-y-4">
      <Button className="h-11 w-full text-base" onClick={onClick} disabled={busy}>
        {busy && <Loader2 aria-hidden className="animate-spin" />}
        {busy ? "Signing in…" : "Sign in to LeaseLens"}
      </Button>
      {state.kind === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
    </div>
  );
}
