"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Loader2, LogIn, MailCheck } from "lucide-react";
import {
  REQUEST_LINK_MESSAGE,
  RequestLinkResponseSchema,
  type DemoAccount,
  type VerifyLinkResponse,
} from "@leaselens/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost, ApiError } from "@/lib/api";

type State =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; demoSignInUrl: string | null }
  | { kind: "error"; message: string };

/**
 * Email sign-in. In demo mode (local only) it also offers the demo accounts and, for a known account,
 * shows the link that would normally be emailed.
 */
export function SignInForm({ demoAccounts }: { demoAccounts: readonly DemoAccount[] | null }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ kind: "sending" });
    try {
      const res = RequestLinkResponseSchema.safeParse(await apiPost<unknown>("/auth/request-link", { email }));
      setState({ kind: "sent", demoSignInUrl: res.success ? (res.data.demo?.signInUrl ?? null) : null });
    } catch (err) {
      setState({ kind: "error", message: err instanceof ApiError ? err.message : "Something went wrong." });
    }
  }

  if (state.kind === "sent") {
    // Same message whether or not the account exists.
    return (
      <div className="space-y-4">
        <div role="status" className="space-y-4 rounded-lg border p-6 text-center">
          <MailCheck aria-hidden className="mx-auto size-8 text-primary" />
          <h2 className="text-lg font-medium">Check your email</h2>
          <p className="text-sm text-muted-foreground">{REQUEST_LINK_MESSAGE}</p>
          <Button variant="outline" className="h-11 w-full" onClick={() => setState({ kind: "idle" })}>
            Use a different email
          </Button>
        </div>
        {state.demoSignInUrl && <DemoSignIn signInUrl={state.demoSignInUrl} />}
      </div>
    );
  }

  const sending = state.kind === "sending";
  return (
    <div className="space-y-6">
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

      {demoAccounts && demoAccounts.length > 0 && (
        <section aria-labelledby="demo-accounts-heading" className="space-y-3 rounded-lg border-2 border-dashed border-amber-400 bg-amber-50 p-4 dark:border-amber-600 dark:bg-amber-950">
          <h2 id="demo-accounts-heading" className="flex items-center gap-2 text-sm font-semibold">
            <FlaskConical aria-hidden className="size-4" />
            Demo accounts
          </h2>
          <p className="text-xs text-muted-foreground">Demo mode is on. Pick an account to fill in its email.</p>
          <div className="grid grid-cols-2 gap-2">
            {demoAccounts.map((a) => (
              <Button
                key={a.email}
                type="button"
                variant="outline"
                className="h-11 bg-background"
                aria-pressed={email === a.email}
                onClick={() => {
                  setEmail(a.email);
                  if (state.kind === "error") setState({ kind: "idle" });
                }}
              >
                {a.label}
              </Button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** Demo mode only: sign in with the link that would have been emailed — one click, no inbox needed. */
function DemoSignIn({ signInUrl }: { signInUrl: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    const token = new URL(signInUrl).searchParams.get("token");
    if (!token) {
      setError("This demo link is incomplete. Request a new one.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { redirectTo } = await apiPost<VerifyLinkResponse>("/auth/verify", { token });
      router.replace(redirectTo);
      router.refresh();
    } catch (err) {
      setBusy(false);
      setError(err instanceof ApiError ? err.message : "Couldn't sign in. Please try again.");
    }
  }

  return (
    <section
      aria-labelledby="demo-link-heading"
      className="space-y-3 rounded-lg border-2 border-dashed border-amber-400 bg-amber-50 p-4 text-center dark:border-amber-600 dark:bg-amber-950"
    >
      <h2 id="demo-link-heading" className="flex items-center justify-center gap-2 text-sm font-semibold">
        <FlaskConical aria-hidden className="size-4" />
        Demo mode — in the live app this link is emailed
      </h2>
      <Button className="h-11 w-full text-base" onClick={signIn} disabled={busy}>
        {busy ? <Loader2 aria-hidden className="animate-spin" /> : <LogIn aria-hidden />}
        {busy ? "Signing in…" : "Sign in now"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
