"use client";

import { useEffect } from "react";

/**
 * After an action that replaces the form (sending a request, answers, approving, completing), moves
 * keyboard and screen-reader focus to the result, so it's announced and the user continues from there
 * instead of from the top of the page. The target needs tabIndex={-1}.
 */
export function FocusOnMount({ targetId }: { targetId: string }) {
  useEffect(() => {
    document.getElementById(targetId)?.focus();
  }, [targetId]);
  return null;
}
