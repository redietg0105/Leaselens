"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/api";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setError(null);
    try {
      await apiPost("/auth/logout");
      router.replace("/signin");
      router.refresh();
    } catch {
      setBusy(false);
      setError("Couldn't sign out. Try again.");
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
      <Button variant="outline" size="lg" onClick={onClick} disabled={busy}>
        {busy ? <Loader2 aria-hidden className="animate-spin" /> : <LogOut aria-hidden />}
        Sign out
      </Button>
    </div>
  );
}
