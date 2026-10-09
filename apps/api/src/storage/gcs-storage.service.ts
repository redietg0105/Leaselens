import { StorageService, assertValidKey } from './storage.service';

/** Fetches an OAuth access token. On Cloud Run: the service account's token from the metadata server. */
export type TokenSource = () => Promise<string>;

const METADATA_TOKEN_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';
const API = 'https://storage.googleapis.com';
const CONTENT_TYPE: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/**
 * The Cloud Run service account's token from the metadata server — no key file. Cached until a minute
 * before it expires.
 */
export function metadataTokenSource(fetchImpl: typeof fetch = fetch): TokenSource {
  let cached: { token: string; expiresAt: number } | null = null;
  return async () => {
    if (cached && Date.now() < cached.expiresAt) return cached.token;
    const res = await fetchImpl(METADATA_TOKEN_URL, { headers: { 'Metadata-Flavor': 'Google' } });
    if (!res.ok) throw new Error(`Metadata server token request failed (${res.status})`);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    cached = { token: body.access_token, expiresAt: Date.now() + Math.max(0, body.expires_in - 60) * 1000 };
    return cached.token;
  };
}

/** Thrown by read() for an object that doesn't exist (the caller answers 404, as with a missing local file). */
export class StorageObjectNotFound extends Error {}

/**
 * Photos in a Cloud Storage bucket, through the JSON API with the service account's token. Same keys and
 * rules as local storage: only server-generated keys, and an existing object is never overwritten.
 */
export class GcsStorageService extends StorageService {
  constructor(
    private readonly bucket: string,
    private readonly token: TokenSource = metadataTokenSource(),
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    super();
  }

  private objectUrl(key: string): string {
    assertValidKey(key);
    return `${API}/storage/v1/b/${encodeURIComponent(this.bucket)}/o/${encodeURIComponent(key)}`;
  }

  private async auth(): Promise<Record<string, string>> {
    return { Authorization: `Bearer ${await this.token()}` };
  }

  async save(key: string, data: Buffer): Promise<void> {
    assertValidKey(key);
    const ext = key.split('.').pop()!;
    // ifGenerationMatch=0: only create, never overwrite (like the local "wx" flag).
    const url = `${API}/upload/storage/v1/b/${encodeURIComponent(this.bucket)}/o?uploadType=media&ifGenerationMatch=0&name=${encodeURIComponent(key)}`;
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: { ...(await this.auth()), 'Content-Type': CONTENT_TYPE[ext] ?? 'application/octet-stream' },
      body: new Uint8Array(data),
    });
    if (!res.ok) throw new Error(`Cloud Storage upload failed (${res.status})`);
  }

  async read(key: string): Promise<Buffer> {
    const res = await this.fetchImpl(`${this.objectUrl(key)}?alt=media`, { headers: await this.auth() });
    if (res.status === 404) throw new StorageObjectNotFound(`No object ${key}`);
    if (!res.ok) throw new Error(`Cloud Storage read failed (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    const res = await this.fetchImpl(this.objectUrl(key), { method: 'DELETE', headers: await this.auth() });
    // Already gone is fine (like rm --force).
    if (!res.ok && res.status !== 404) throw new Error(`Cloud Storage delete failed (${res.status})`);
  }
}
