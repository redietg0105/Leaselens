/**
 * The Prisma CLI prints where it connects (e.g. `Datasource "db": … at "ep-xxxx.neon.tech"` or
 * "Can't reach database server at `host:5432`"). The host is part of the database URL secret, so job logs
 * show it hidden.
 */
export function redactDbHost(text: string): string {
  return text
    .replace(/(\bat\s+)"[^"\s]+"/g, '$1"<database host hidden>"')
    .replace(/(\bat\s+)`[^`\s]+`/g, '$1`<database host hidden>`')
    .replace(/postgres(?:ql)?:\/\/\S+/g, '<database URL hidden>');
}
