"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ImagePlus, Loader2, X } from "lucide-react";
import { ALLOWED_PHOTO_TYPES, CompleteJobSchema } from "@leaselens/shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiPost, ApiError } from "@/lib/api";
import { checkPhotoFile } from "@/lib/photo-file";

/** Mark a job complete with a note and an optional photo (same photo rules as tenants). */
export function CompleteJobForm({ jobId }: { jobId: string }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.url);
  }, [photo]);

  async function onPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const problem = await checkPhotoFile(file);
    setPhotoError(problem);
    if (!problem) setPhoto({ file, url: URL.createObjectURL(file) });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    setSubmitError(null);
    const parsed = CompleteJobSchema.safeParse({ note });
    if (!parsed.success) {
      setNoteError(parsed.error.issues[0]?.message ?? "Describe what you did.");
      document.getElementById("note-field")?.focus();
      return;
    }
    setNoteError(null);

    const form = new FormData();
    form.set("note", parsed.data.note);
    if (photo) form.set("photo", photo.file, photo.file.name);
    setSending(true);
    try {
      await apiPost(`/vendor/jobs/${jobId}/complete`, form);
      router.refresh();
    } catch (err) {
      setSending(false);
      setSubmitError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4 rounded-lg border p-4">
      <h2 className="font-semibold">Mark job complete</h2>

      <div className="space-y-2">
        <Label htmlFor="note-field">What did you do?</Label>
        <Textarea
          id="note-field"
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={sending}
          aria-invalid={!!noteError}
          aria-describedby={noteError ? "note-error" : undefined}
          placeholder="e.g. Replaced the P-trap washer and tested for 10 minutes, no leak."
          className="text-base"
        />
        {noteError && (
          <p id="note-error" className="text-sm text-destructive">
            {noteError}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <span className="text-sm font-medium">
          Photo of the finished work <span className="font-normal text-muted-foreground">(optional)</span>
        </span>
        {photo ? (
          <div className="relative w-40 overflow-hidden rounded-lg border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element -- local preview from a blob: URL */}
            <img src={photo.url} alt="Completion photo preview" className="aspect-square w-full object-cover" />
            <button
              type="button"
              onClick={() => setPhoto(null)}
              disabled={sending}
              aria-label="Remove photo"
              className="absolute top-1 right-1 flex size-8 items-center justify-center rounded-full bg-background/90 shadow ring-1 ring-border focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
        ) : (
          <Button type="button" variant="outline" className="h-11" onClick={() => fileInput.current?.click()} disabled={sending}>
            <ImagePlus aria-hidden />
            Add photo
          </Button>
        )}
        <input ref={fileInput} type="file" accept={ALLOWED_PHOTO_TYPES.join(",")} hidden onChange={onPick} />
        <p className="text-xs text-muted-foreground">JPG, PNG or WebP, up to 5 MB.</p>
        {photoError && <p className="text-sm text-destructive">{photoError}</p>}
      </div>

      {submitError && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {submitError}
        </p>
      )}

      <Button type="submit" className="h-11 w-full text-base" disabled={sending}>
        {sending ? <Loader2 aria-hidden className="animate-spin" /> : <CheckCircle2 aria-hidden />}
        {sending ? "Saving…" : "Mark complete"}
      </Button>
    </form>
  );
}
