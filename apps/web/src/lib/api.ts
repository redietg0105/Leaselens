/** Base URL of the LeaseLens API (port 4100 in development). */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Turns an API path like /work-orders/x/media/y into a full URL (for <img src>). */
export const apiUrl = (path: string) => `${API_URL}${path}`;

/**
 * Browser-side call to the API. `credentials: "include"` sends the session cookie:
 * localhost:3000 and localhost:4100 are the same site, so the SameSite=Lax cookie is allowed.
 * Pass FormData for uploads (the browser sets the multipart boundary).
 */
export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      method: "POST",
      credentials: "include",
      headers: isForm ? undefined : { "Content-Type": "application/json" },
      body: isForm ? body : JSON.stringify(body ?? {}),
    });
  } catch {
    throw new ApiError(0, "Can't reach LeaseLens right now. Check your connection and try again.");
  }

  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      res.status === 429
        ? "Too many attempts. Please wait a few minutes and try again."
        : res.status === 401
          ? "Your session has ended. Please sign in again."
          : typeof data === "object" && data && "message" in data && typeof data.message === "string"
            ? data.message
            : "Something went wrong. Please try again.";
    throw new ApiError(res.status, message);
  }
  return data as T;
}
