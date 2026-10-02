/**
 * Removes personal details from tenant text before it is sent to any AI model
 * (CLAUDE.md safety rule 2). Tenants sometimes write "call me at 202-555-0143" in the description.
 */

export const REDACTED = '[removed]';

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// US-style phone numbers: 10 digits with optional +1, brackets, spaces, dots or dashes.
const PHONE = /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Replaces emails, phone numbers and the tenant's own name (each part of 3+ letters) with [removed]. */
export function redactPersonalDetails(text: string, personName?: string | null): string {
  let out = text.replace(EMAIL, REDACTED).replace(PHONE, REDACTED);
  const nameParts = (personName ?? '').split(/\s+/).filter((p) => p.length >= 3);
  for (const part of nameParts) {
    out = out.replace(new RegExp(`\\b${escapeRegex(part)}\\b`, 'gi'), REDACTED);
  }
  return out;
}
