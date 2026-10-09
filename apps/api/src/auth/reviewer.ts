import { createHash, timingSafeEqual } from 'node:crypto';
import type { ReviewerRole } from '@leaselens/shared';

/**
 * Reviewer access (live site, for grading): an access code signs in to one of the five seeded demo
 * accounts. Off unless REVIEWER_ACCESS="on" and a long enough REVIEWER_ACCESS_CODE is set.
 */
export const REVIEWER_CODE_MIN_LENGTH = 16;

/** The only accounts reviewer access can ever sign in to: fixed seeded ids, never one from the request. */
export const REVIEWER_USER_IDS: Readonly<Record<ReviewerRole, string>> = {
  TENANT: 'seed_user_tenant',
  COORDINATOR: 'seed_user_coordinator',
  VENDOR: 'seed_user_vendor',
  LEASING: 'seed_user_leasing',
  MANAGER: 'seed_user_manager',
};

/** The access code, or null when reviewer access is off. Read on every request, so a settings change applies at once. */
export function reviewerCode(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.REVIEWER_ACCESS !== 'on') return null;
  const code = env.REVIEWER_ACCESS_CODE?.trim() ?? '';
  return code.length >= REVIEWER_CODE_MIN_LENGTH ? code : null;
}

/**
 * Constant-time comparison. Both sides are hashed first, so the comparison is always 32 bytes against 32 bytes
 * and the time taken reveals neither the content nor the length of the code.
 */
export function codeMatches(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}

const MINUTE = 60 * 1000;

/**
 * Counts wrong codes in memory (the API runs as a single Cloud Run instance). Correct codes are not counted,
 * so switching between accounts never locks anyone out.
 *  - Per address: 5 wrong codes in 15 minutes, then every attempt from that address is refused until the
 *    oldest one is 15 minutes old.
 *  - All addresses together: 50 wrong codes in 15 minutes pause reviewer sign-in for everyone. This bounds
 *    guessing even by someone who can vary the address the API sees.
 */
export class WrongCodeLimiter {
  private readonly byAddress = new Map<string, number[]>();
  private all: number[] = [];

  constructor(
    readonly perAddress = 5,
    readonly overall = 50,
    readonly windowMs = 15 * MINUTE,
    private readonly now: () => number = Date.now,
  ) {}

  /** Why attempts are refused right now, or null if this address may try. */
  blocked(address: string): 'address' | 'overall' | null {
    this.prune();
    if (this.all.length >= this.overall) return 'overall';
    if ((this.byAddress.get(address)?.length ?? 0) >= this.perAddress) return 'address';
    return null;
  }

  recordWrong(address: string): void {
    const t = this.now();
    this.all.push(t);
    this.byAddress.set(address, [...(this.byAddress.get(address) ?? []), t]);
  }

  /** Drops failures older than the window, so memory stays bounded by the overall limit. */
  private prune(): void {
    const cutoff = this.now() - this.windowMs;
    this.all = this.all.filter((t) => t > cutoff);
    for (const [address, times] of this.byAddress) {
      const recent = times.filter((t) => t > cutoff);
      if (recent.length === 0) this.byAddress.delete(address);
      else this.byAddress.set(address, recent);
    }
  }
}
