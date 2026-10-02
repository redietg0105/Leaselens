/**
 * A path to send the user back to after reconnecting or signing in. Only same-site paths are
 * allowed (e.g. "/tenant/requests/abc?created=1"); anything else — "//evil.com", "https://…",
 * "/\evil.com", control characters — falls back, so it can't be used as an open redirect.
 */
export function safeReturnPath(value: unknown, fallback = '/'): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 500) return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return fallback;
  return value;
}
