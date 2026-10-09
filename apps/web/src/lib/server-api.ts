import { API_URL } from "./api";

/**
 * Base URL for calls from the web server (server components, route code). In the browser the API is
 * reached through the same-origin /api rewrite (NEXT_PUBLIC_API_URL=/api when deployed), but a server
 * fetch needs a full URL, so it uses API_INTERNAL_URL (the API service's address). Locally both are
 * http://localhost:4100.
 */
export const serverApiUrl = (path: string) => `${process.env.API_INTERNAL_URL ?? API_URL}${path}`;
