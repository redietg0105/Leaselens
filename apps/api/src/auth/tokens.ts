import { createHash, randomBytes } from 'node:crypto';

/** 32 random bytes, URL-safe. Used for magic-link and session tokens. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Only this hash is stored in the database — never the raw token. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
