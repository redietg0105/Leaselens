import { IMAGE_SNIFF_BYTES, photoProblem } from "@leaselens/shared";

/** A picked file the browser couldn't read (e.g. a cloud-only photo that didn't download on a phone). */
export const UNREADABLE_PHOTO = "This photo couldn't be opened. Take it again or choose another one.";

/**
 * Same check the API runs: size, then the real type from the file's first bytes. Never throws — a file
 * that can't be read gets a message instead of an error nobody sees.
 */
export async function checkPhotoFile(file: File): Promise<string | null> {
  try {
    const head = new Uint8Array(await file.slice(0, IMAGE_SNIFF_BYTES).arrayBuffer());
    return photoProblem(file.size, head);
  } catch {
    return UNREADABLE_PHOTO;
  }
}

let counter = 0;
/**
 * A key for a picked photo. crypto.randomUUID() exists only on HTTPS and localhost, so opening the dev
 * server from a phone (http://192.168.x.x:3000) would otherwise make adding a photo fail.
 */
export function photoKey(): string {
  counter += 1;
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `photo-${Date.now()}-${counter}`;
}
