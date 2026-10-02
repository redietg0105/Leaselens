"use client";

import { useState, type FormEvent } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { REQUEST_LINK_MESSAGE } from "@leaselens/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost, ApiError } from "@/lib/api";

type State = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ kind: "sending" });
    try {
      await apiPost<{ message: string }>("/auth/request-link", { email });
      setState({ kind: "sent" });
    } catch (err) {
      setState({ kind: "error", message: err instanceof ApiError ? err.message : "Something went wrong." });
    }
  }

  if (state.kind === "sent") {
    // Same message whether or not the account exists.
    return (
      <div role="status" className="space-y-4 rounded-lg border p-6 text-center">
        <MailCheck aria-hidden className="mx-auto size-8 text-primary" />
        <h2 className="text-lg font-medium">Check your email</h2>
        <p className="text-sm text-muted-foreground">{REQUEST_LINK_MESSAGE}</p>
        <Button variant="outline" className="h-11 w-full" onClick={() => setState({ kind: "idle" })}>
          Use a different email
        </Button>
      </div>
    );
  }

  const sending = state.kind === "sending";
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={sending}
          aria-invalid={state.kind === "error"}
          aria-describedby={state.kind === "error" ? "email-error" : undefined}
          className="h-11 text-base"
          placeholder="you@example.com"
        />
        {state.kind === "error" && (
          <p id="email-error" role="alert" className="text-sm text-destructive">
            {state.message}
          </p>
        )}
      </div>
      <Button type="submit" className="h-11 w-full text-base" disabled={sending || email.trim() === ""}>
        {sending && <Loader2 aria-hidden className="animate-spin" />}
        {sending ? "Sending link…" : "Email me a sign-in link"}
      </Button>
    </form>
  );
}
