"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, X } from "lucide-react";
import {
  ACCESS_NOTES_MAX,
  ALLOWED_PHOTO_TYPES,
  CreateWorkOrderSchema,
  DESCRIPTION_MAX,
  ENTRY_PERMISSION_LABEL,
  EntryPermissionSchema,
  MAX_PHOTOS,
  PHOTO_ERRORS,
  type EntryPermission,
  type WorkOrderDetail,
} from "@leaselens/shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiPost, ApiError } from "@/lib/api";
import { checkPhotoFile, photoKey } from "@/lib/photo-file";
import { cn } from "@/lib/utils";

type Photo = { key: string; file: File; previewUrl: string };
type FieldErrors = Partial<Record<"description" | "entryPermission" | "accessNotes" | "photos", string>>;

export function NewRequestForm() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [description, setDescription] = useState("");
  const [entryPermission, setEntryPermission] = useState<EntryPermission | "">("");
  const [accessNotes, setAccessNotes] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Free preview URLs when photos are removed or the page is left.
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl)), []);

  async function onPickPhotos(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = ""; // allow picking the same file again after removing it
    if (picked.length === 0) return;

    const room = MAX_PHOTOS - photos.length;
    let problem: string | null = picked.length > room ? PHOTO_ERRORS.tooMany : null;
    const accepted: Photo[] = [];
    for (const file of picked.slice(0, Math.max(room, 0))) {
      const fileProblem = await checkPhotoFile(file);
      if (fileProblem) {
        problem = `${file.name}: ${fileProblem}`;
        continue;
      }
      accepted.push({ key: photoKey(), file, previewUrl: URL.createObjectURL(file) });
    }
    setPhotos((prev) => [...prev, ...accepted]);
    setErrors((prev) => ({ ...prev, photos: problem ?? undefined }));
  }

  function removePhoto(key: string) {
    setPhotos((prev) => {
      const gone = prev.find((p) => p.key === key);
      if (gone) URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((p) => p.key !== key);
    });
    setErrors((prev) => ({ ...prev, photos: undefined }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitError(null);

    // Same shared schema the API uses.
    const parsed = CreateWorkOrderSchema.safeParse({
      description,
      entryPermission: entryPermission || undefined,
      accessNotes,
    });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof FieldErrors;
        next[field] ??= issue.message;
      }
      setErrors(next);
      document.getElementById(`${Object.keys(next)[0]}-field`)?.focus();
      return;
    }
    setErrors({});

    const form = new FormData();
    form.set("description", parsed.data.description);
    form.set("entryPermission", parsed.data.entryPermission);
    if (parsed.data.accessNotes) form.set("accessNotes", parsed.data.accessNotes);
    for (const p of photos) form.append("photos", p.file, p.file.name);

    setSubmitting(true);
    try {
      const created = await apiPost<WorkOrderDetail>("/work-orders", form);
      router.push(`/tenant/requests/${created.id}?created=1`);
      router.refresh();
    } catch (err) {
      setSubmitting(false);
      setSubmitError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="description-field">What&apos;s the problem?</Label>
        <Textarea
          id="description-field"
          name="description"
          rows={5}
          maxLength={DESCRIPTION_MAX + 200}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={submitting}
          aria-invalid={!!errors.description}
          aria-describedby="description-help description-error"
          placeholder="e.g. Water is dripping under the kitchen sink and the cabinet floor is wet."
          className="min-h-32 text-base"
        />
        <div className="flex justify-between gap-3 text-xs text-muted-foreground">
          <span id="description-help">Where is it, what happens, and since when.</span>
          <span className={cn("tabular-nums", description.trim().length > DESCRIPTION_MAX && "text-destructive")}>
            {description.trim().length} / {DESCRIPTION_MAX}
          </span>
        </div>
        {errors.description && (
          <p id="description-error" className="text-sm text-destructive">
            {errors.description}
          </p>
        )}
      </div>

      {/* Photos */}
      <div className="space-y-2">
        <span className="text-sm font-medium" id="photos-label">
          Photos <span className="font-normal text-muted-foreground">(optional, up to {MAX_PHOTOS})</span>
        </span>
        <ul className="grid grid-cols-3 gap-2" aria-labelledby="photos-label">
          {photos.map((p, i) => (
            <li key={p.key} className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview from a blob: URL */}
              <img src={p.previewUrl} alt={`Photo ${i + 1} preview`} className="size-full object-cover" />
              <button
                type="button"
                onClick={() => removePhoto(p.key)}
                disabled={submitting}
                aria-label={`Remove photo ${i + 1}`}
                className="absolute top-1 right-1 flex size-8 items-center justify-center rounded-full bg-background/90 shadow ring-1 ring-border hover:bg-background focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <X aria-hidden className="size-4" />
              </button>
            </li>
          ))}
          {photos.length < MAX_PHOTOS && (
            <li>
              <button
                type="button"
                id="photos-field"
                onClick={() => fileInput.current?.click()}
                disabled={submitting}
                className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-sm text-muted-foreground hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <ImagePlus aria-hidden className="size-6" />
                Add photo
              </button>
            </li>
          )}
        </ul>
        <input
          ref={fileInput}
          type="file"
          accept={ALLOWED_PHOTO_TYPES.join(",")}
          multiple
          hidden
          onChange={onPickPhotos}
        />
        <p className="text-xs text-muted-foreground">JPG, PNG or WebP, up to 5 MB each.</p>
        {errors.photos && <p className="text-sm text-destructive">{errors.photos}</p>}
      </div>

      {/* Permission to enter */}
      <fieldset className="space-y-2" aria-describedby={errors.entryPermission ? "entry-error" : undefined}>
        <legend className="mb-2 text-sm font-medium">May we enter if you&apos;re not home?</legend>
        <div className="grid gap-2" id="entryPermission-field" tabIndex={-1}>
          {EntryPermissionSchema.options.map((value) => (
            <label
              key={value}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-muted/60 has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                errors.entryPermission && "border-destructive",
              )}
            >
              <input
                type="radio"
                name="entryPermission"
                value={value}
                checked={entryPermission === value}
                onChange={() => {
                  setEntryPermission(value);
                  setErrors((prev) => ({ ...prev, entryPermission: undefined }));
                }}
                disabled={submitting}
                className="size-4 accent-primary"
              />
              {ENTRY_PERMISSION_LABEL[value]}
            </label>
          ))}
        </div>
        {errors.entryPermission && (
          <p id="entry-error" className="text-sm text-destructive">
            {errors.entryPermission}
          </p>
        )}
      </fieldset>

      {/* Access notes */}
      <div className="space-y-2">
        <Label htmlFor="accessNotes-field">
          Access notes <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="accessNotes-field"
          name="accessNotes"
          rows={2}
          value={accessNotes}
          onChange={(e) => setAccessNotes(e.target.value)}
          disabled={submitting}
          aria-invalid={!!errors.accessNotes}
          placeholder="e.g. Dog in the bedroom. Best time: after 5 pm."
          className="text-base"
        />
        <div className="flex justify-end text-xs text-muted-foreground">
          <span className={cn("tabular-nums", accessNotes.trim().length > ACCESS_NOTES_MAX && "text-destructive")}>
            {accessNotes.trim().length} / {ACCESS_NOTES_MAX}
          </span>
        </div>
        {errors.accessNotes && <p className="text-sm text-destructive">{errors.accessNotes}</p>}
      </div>

      {submitError && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {submitError}
        </p>
      )}

      <Button type="submit" className="h-11 w-full text-base" disabled={submitting}>
        {submitting && <Loader2 aria-hidden className="animate-spin" />}
        {submitting ? "Sending request…" : "Send request"}
      </Button>
    </form>
  );
}
