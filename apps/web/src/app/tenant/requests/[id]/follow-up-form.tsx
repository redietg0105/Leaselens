"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageCircleQuestion } from "lucide-react";
import { SubmitAnswersSchema, type WorkOrderDetail } from "@leaselens/shared";
import { Button } from "@/components/ui/button";
import { apiPost, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

type Question = WorkOrderDetail["followUpQuestions"][number];

/** Up to two multiple-choice questions from the approved bank. Answers re-run triage. */
export function FollowUpForm({ requestId, questions }: { requestId: string; questions: Question[] }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [missing, setMissing] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const unanswered = questions.filter((q) => !answers[q.id]).map((q) => q.id);
    setMissing(unanswered);
    if (unanswered.length) {
      document.getElementById(`q-${unanswered[0]}`)?.focus();
      return;
    }
    const parsed = SubmitAnswersSchema.safeParse({
      answers: questions.map((q) => ({ questionId: q.id, answer: answers[q.id] })),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please answer the questions.");
      return;
    }

    setSending(true);
    setError(null);
    try {
      await apiPost(`/work-orders/${requestId}/answers`, parsed.data);
      router.refresh();
    } catch (err) {
      setSending(false);
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <section aria-labelledby="followup-heading" className="space-y-4 rounded-lg border-2 border-amber-400 bg-amber-50 p-4 dark:border-amber-600 dark:bg-amber-950">
      <div className="flex items-start gap-3">
        <MessageCircleQuestion aria-hidden className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-300" />
        <div>
          <h2 id="followup-heading" className="font-semibold">
            {questions.length === 1 ? "One quick question" : `${questions.length} quick questions`}
          </h2>
          <p className="text-sm text-muted-foreground">Your answers help us send the right technician.</p>
        </div>
      </div>

      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {questions.map((q) => (
          <fieldset key={q.id} className="space-y-2" aria-describedby={missing.includes(q.id) ? `${q.id}-error` : undefined}>
            <legend className="mb-2 text-sm font-medium">{q.text}</legend>
            <div className="grid gap-2" id={`q-${q.id}`} tabIndex={-1}>
              {q.options.map((o) => (
                <label
                  key={o.value}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border bg-background px-3 py-2 text-sm has-checked:border-primary has-checked:bg-muted/60 has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                    missing.includes(q.id) && "border-destructive",
                  )}
                >
                  <input
                    type="radio"
                    name={q.id}
                    value={o.value}
                    checked={answers[q.id] === o.value}
                    onChange={() => {
                      setAnswers((prev) => ({ ...prev, [q.id]: o.value }));
                      setMissing((prev) => prev.filter((id) => id !== q.id));
                    }}
                    disabled={sending}
                    className="size-4 accent-primary"
                  />
                  {o.label}
                </label>
              ))}
            </div>
            {missing.includes(q.id) && (
              <p id={`${q.id}-error`} className="text-sm text-destructive">
                Please choose an answer.
              </p>
            )}
          </fieldset>
        ))}

        {error && (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" className="h-11 w-full text-base" disabled={sending}>
          {sending && <Loader2 aria-hidden className="animate-spin" />}
          {sending ? "Sending…" : "Send answers"}
        </Button>
      </form>
    </section>
  );
}
