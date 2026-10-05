/**
 * An error as one log-safe line. Prisma errors can quote the query, including the values written
 * (a tenant's description, an email), so only their class, code and final line — the actual reason,
 * e.g. "Unique constraint failed on the fields: (`email`)" — are kept.
 */
export function errorText(err: unknown, withStack = false): string {
  if (!(err instanceof Error)) return String(err);
  if (err.constructor.name.startsWith('PrismaClient')) {
    const code = (err as { code?: unknown }).code;
    const reason = err.message.trim().split('\n').filter((l) => l.trim()).pop() ?? '';
    return `${err.constructor.name}${typeof code === 'string' ? ` ${code}` : ''}: ${reason.trim().slice(0, 300)}`;
  }
  return withStack && err.stack ? err.stack : err.message;
}
