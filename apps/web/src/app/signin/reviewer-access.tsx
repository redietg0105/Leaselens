"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";
import {
  REVIEWER_ACCOUNTS,
  ReviewerSignInSchema,
  type ReviewerRole,
  type VerifyLinkResponse,
} from "@leaselens/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost, ApiError } from "@/lib/api";

type Problem = { message: string; aboutCode: boolean };

/**
 * Reviewer access (live site, for grading, only when the API has it switched on): the access code plus one
 * click signs in to a seeded demo account. The browser sends only the code and the role.
 */
export function ReviewerAccess() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busyRole, setBusyRole] = useState<ReviewerRole | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);

  async function signIn(role: ReviewerRole) {
    const parsed = ReviewerSignInSchema.safeParse({ code, role });
    if (!parsed.success) {
      setProblem({ message: parsed.error.issues[0]?.message ?? "Enter the access code.", aboutCode: true });
      return;
    }
    setBusyRole(role);
    setProblem(null);
    try {
      const { redirectTo } = await apiPost<VerifyLinkResponse>("/auth/reviewer", parsed.data);
      router.replace(redirectTo);
      router.refresh();
    } catch (err) {
      setBusyRole(null);
      const message = err instanceof ApiError ? err.message : "Couldn't sign in. Please try again.";
      // A wrong code is about the field; "Too many attempts" and "not available" are not.
      setProblem({ message, aboutCode: err instanceof ApiError && err.status === 403 });
    }
  }

  const busy = busyRole !== null;
  const codeError = problem?.aboutCode ? problem.message : null;
  return (
    <section aria-labelledby="reviewer-heading" className="space-y-3 rounded-lg border p-4">
      <h2 id="reviewer-heading" className="flex items-center gap-2 text-sm font-semibold">
        <KeyRound aria-hidden className="size-4" />
        Reviewer access
      </h2>
      <p className="text-xs text-muted-foreground">
        For course reviewers: enter the access code, then choose a demo account.
      </p>
      <div className="space-y-2">
        <Label htmlFor="reviewer-code">Access code</Label>
        <Input
          id="reviewer-code"
          type="password"
          name="reviewer-code"
          autoComplete="off"
          spellCheck={false}
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            // The code changed, so an error about it no longer applies.
            if (problem?.aboutCode) setProblem(null);
          }}
          disabled={busy}
          aria-invalid={!!codeError}
          aria-describedby={codeError ? "reviewer-code-error" : undefined}
          className="h-11 text-base"
        />
        {codeError && (
          <p id="reviewer-code-error" role="alert" className="text-sm text-destructive">
            {codeError}
          </p>
        )}
      </div>
      <p id="reviewer-roles" className="text-sm font-medium">
        Sign in as
      </p>
      <div role="group" aria-labelledby="reviewer-roles" className="grid grid-cols-2 gap-2">
        {REVIEWER_ACCOUNTS.map((a) => (
          <Button
            key={a.role}
            type="button"
            variant="outline"
            className="h-11"
            disabled={busy}
            onClick={() => signIn(a.role)}
          >
            {busyRole === a.role && <Loader2 aria-hidden className="animate-spin" />}
            {busyRole === a.role ? "Signing in…" : a.label}
          </Button>
        ))}
      </div>
      {problem && !problem.aboutCode && (
        <p role="alert" className="text-sm text-destructive">
          {problem.message}
        </p>
      )}
    </section>
  );
}
