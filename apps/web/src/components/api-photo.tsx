"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";

/**
 * A photo served by the API (with the session cookie — next/image would fetch it without one).
 * If it can't load (file missing, API restarting), a "Photo unavailable" tile replaces the browser's
 * broken-image icon.
 */
export function ApiPhoto({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        role="img"
        aria-label={`${alt} (not available)`}
        className="flex aspect-square size-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-muted-foreground"
      >
        <ImageOff aria-hidden className="size-5" />
        Photo unavailable
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- see above
    <img src={src} alt={alt} loading="lazy" className="aspect-square size-full object-cover" onError={() => setFailed(true)} />
  );
}
