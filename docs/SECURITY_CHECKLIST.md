# LeaseLens — Security Checklist

**State as of:** 2026-10-05, commit `04f6424` and later
**Sources:** the code in `apps/api`, `apps/web` and `packages/shared`; the tests in `apps/api/test` and `e2e/`;
the security audit and its commits (see [`DEVLOG.md`](DEVLOG.md), sessions 10, 14 and 16).
Where a measure has an automated test, the test file is named; all tests run with `npm run check`, except the
browser test (`npm run test:e2e`).

## 1. Security measures in place

### Secrets
- [x] **Only placeholder `.env.example` files are committed.** `.env*`, `uploads/` and build output are gitignored; a test checks the example files contain no real-looking keys or hosts (`observability.spec.ts`).
- [x] **Git history scanned for secrets** (sessions 10 and 14): no API keys, passwords or database hosts in any commit; the only connection strings are placeholders such as `USER:PASSWORD@HOST`.
- [x] **Secrets stay on the server.** The Gemini key and database URLs are read only by the API; the web app's only setting (`NEXT_PUBLIC_API_URL`) is documented as public.
- [x] **Startup settings check.** The API refuses to start with a missing or malformed setting and says which one, without printing values (`observability.spec.ts`).

### Authentication and sessions
- [x] **Passwordless sign-in with one-time links:** 256-bit random tokens, valid 15 minutes, usable once (atomic check-and-mark), stored only as SHA-256 hashes (`auth.e2e.spec.ts`).
- [x] **Same response for any email**, issued in the background so neither the text nor the timing reveals whether an account exists (outside demo mode) (`auth.e2e.spec.ts`, `demo-mode.e2e.spec.ts`).
- [x] **Sign-in needs a click** on the confirm page (a POST), so email scanners that open links can't use them up.
- [x] **Session cookie:** random token stored as a hash; `httpOnly`, `SameSite=Lax`, `Secure` in production; 7-day expiry checked on every request; sign-out deletes the session (`auth.e2e.spec.ts`).
- [x] **Rate limits:** sign-in link requests 5 per address per 15 min and 3 per account per 15 min; sign-in confirmation 20 per minute; new maintenance requests 10 per address per 10 min; everything else 120 per minute (`auth.e2e`, `security.e2e`, `demo-mode.e2e`; the 20-per-minute confirmation limit and the 120-per-minute default have no tests of their own).
- [x] **Rate limits behind a proxy:** `TRUST_PROXY` (default 0) makes limits per visitor; without it `X-Forwarded-For` is ignored and can't be forged (`security.e2e.spec.ts`).

### Access control
- [x] **Deny by default.** Every route must be marked public or list its roles; a route without roles is refused (`roles.e2e.spec.ts`).
- [x] **Role and account read from the database on every request**, never from the client.
- [x] **Role checks on the server for every endpoint** (global guards), not only in the web pages (`roles.e2e`, `staff.e2e`, `vendor.e2e`).
- [x] **No guessing other users' IDs (IDOR).** Tenants see only their own requests and photos; vendors only jobs dispatched to their company; another user's item returns the same 404 as a missing one (`work-orders.e2e`, `vendor.e2e`, `triage.e2e`).
- [x] **The acting user comes from the session.** Overrides, approvals, completions and audit entries record the signed-in user; actor or approver fields in a request are ignored (`staff.e2e`, including impostor IDs in the body).
- [x] **Lowering an emergency is deliberate:** a 20+ character reason, explicit confirmation, a separate audit action and an on-call alert (`staff.e2e.spec.ts`).
- [x] **Concurrent changes are refused, not overwritten.** Writes only succeed if the request is unchanged since it was read (409 otherwise), so an emergency can't be lowered past its safeguards by a parallel change (`concurrency.e2e.spec.ts`).
- [x] **Web pages check the area too** (wrong-role users are redirected), as a convenience on top of the API checks (checklist sections 7 and 8).

### Input validation and injection
- [x] **Every body and query validated with shared Zod schemas**; unknown fields are dropped; invalid input returns 400 with a plain message (`work-order-validation`, `auth.e2e`, `staff.e2e`).
- [x] **No SQL built from strings.** All queries go through Prisma (parameterised); a test fails if `$queryRawUnsafe`, `$executeRawUnsafe` or `Prisma.raw` appear, so future pgvector queries must use the `` $queryRaw`…` `` template (`security.e2e.spec.ts`).
- [x] **No HTML injection.** Tenant, vendor and staff text is rendered as plain text by React; script, HTML, SQL text and emoji were checked on every screen that shows them (checklist XS-1 to XS-6).
- [x] **Malformed or oversized bodies** get a plain 400 or a 413, never a crash or the parser's message (`observability.spec.ts`).
- [x] **No open redirects.** Return paths (e.g. after reconnecting) must be same-site paths (`work-order-validation.spec.ts`).

### File uploads
- [x] **Limits:** at most 3 photos of 5 MB each (1 for a completion photo), limited form fields and parts; files are held in memory, never written before checking (`work-orders.e2e`, `vendor.e2e`).
- [x] **Type checked by content** (magic bytes), not by name or the type the browser claims; only JPG, PNG and WebP (`work-order-validation`, `work-orders.e2e`).
- [x] **Re-encoded with sharp:** EXIF orientation applied, then all metadata (GPS, device) dropped; images over 40 megapixels refused (decompression bombs); long edge at most 2560 px (metadata removal and rotation tested in `work-orders.e2e.spec.ts`; the 40-megapixel cap is a sharp setting without its own test).
- [x] **Server-generated storage names** matching a strict pattern (no `../` tricks); files are never overwritten; files are removed again if saving the request fails (the clean-up is tested in `work-orders.e2e.spec.ts`).
- [x] **Photos served only through an access-checked route**, with the stored content type, `nosniff` and `Cache-Control: private` (access rules tested in `work-orders.e2e` and `vendor.e2e`).

### AI (Gemini) data handling and prompt injection
- [x] **Minimal data to the AI:** only the tenant's description, re-encoded photos, unit type and multiple-choice answers; access notes, names, unit number and building are never sent (`triage.e2e.spec.ts` › privacy).
- [x] **Personal details removed first:** emails, phone numbers and the tenant's own name become `[removed]` (`triage-units`, `triage.e2e`; verified with a real call, checklist XS-7).
- [x] **Prompt-injection defence:** tenant text sits between BEGIN/END markers with a random id, fake markers are neutralised, the instructions say the text is data only (`triage-units`, `triage.e2e`; checklist XS-8).
- [x] **Emergency rules run before and after the AI;** the final urgency is the higher of the rules and the AI, so the AI can raise but never lower an emergency (`triage-units`, `triage.e2e`).
- [x] **Every AI answer validated** with a shared schema (category, urgency, confidence, at most 2 follow-up questions from an approved list, summary length); invalid, failed or timed-out (25 s) answers go to Needs review, never crash (`triage.e2e`).
- [x] **Audit trail:** model, prompt version, raw output and any human override are stored for every AI decision; the model recorded is the one that produced the result or error (`triage.e2e`, `staff.e2e`).

### HTTP headers, CSP, CORS and CSRF
- [x] **API headers (Helmet):** default CSP, `nosniff`, HSTS, `X-Frame-Options`, `Referrer-Policy: no-referrer`; cross-origin resource policy `same-site` so only the web app can show photos.
- [x] **CORS** allows only the web app's origin (`WEB_URL`) with credentials (`auth.e2e.spec.ts`).
- [x] **CSRF:** `SameSite=Lax` cookie, plus the API refuses data changes whose `Origin` is another site or that the browser marks `Sec-Fetch-Site: cross-site` (`security.e2e.spec.ts`).
- [x] **Web Content-Security-Policy per request with a nonce:** scripts run only if Next.js marked them; the page talks only to itself and the API; `object-src 'none'`, `frame-ancestors 'none'`, `base-uri` and `form-action` limited to the site (`web-security.spec.ts`; browser check with no violations).
- [x] **Web headers:** `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: same-origin` (sign-in tokens never leak in a Referer), a Permissions-Policy, HSTS in production, no `X-Powered-By`.
- [x] **Errors never show internals:** JSON errors without stack traces, each with a request id for tracing (`observability.spec.ts`, `health.e2e.spec.ts`).

### Logging and privacy
- [x] **Credentials never logged:** cookies, `Set-Cookie` and `Authorization` headers are redacted; request lines log only method, path, status and id (`observability.spec.ts`).
- [x] **No personal data in production logs:** notifications log only their type and id, the mail stand-in logs no address and never a usable link, and database errors are logged as class, code and reason only (`security.e2e.spec.ts`).
- [x] **Audit log of every human and AI action** with the actor from the session.
- [x] **Seed script refuses to run in production** (it wipes the database).

### Dependencies
- [x] **`npm audit` reviewed** (sessions 10, 14 and 16). 39 high findings were reduced to 12 by upgrading Jest and moving `shadcn` to devDependencies. The rest are in tooling; see section 3.
- [x] **Lockfile committed**; install scripts approved one by one (only Prisma's).

### Demo-mode safeguards
- [x] **Off by default** (`DEMO_MODE="off"` in `.env.example`).
- [x] **Never in production:** demo mode is ignored when `NODE_ENV=production`, and the API refuses to start with it on (`demo-mode.e2e.spec.ts`).
- [x] **Local `WEB_URL` only:** the API refuses to start with demo mode on unless `WEB_URL` is localhost or a private-network address, in case `NODE_ENV` was left unset on a server (`demo-mode.e2e.spec.ts`).
- [x] **Local clients only:** demo links and the demo-accounts list are given only to requests from loopback, private or link-local addresses (IPv4-mapped forms like `::ffff:127.0.0.1` handled) (`demo-mode.e2e.spec.ts`).
- [x] **Rate limits stay on** in demo mode; unknown emails get exactly the normal response; an account over its link limit gets a clear demo-only notice (`demo-mode.e2e.spec.ts`; browser test `e2e/demo-sign-in.spec.ts`).

## 2. Vulnerabilities found in the audit

| ID | Severity | What it was | How it was resolved | Test | Commit |
|---|---|---|---|---|---|
| V-01 | **High** | Race on overrides: the "does this lower an emergency?" check ran on a stale read, so a coordinator could lower an emergency another had just raised, skipping the reason, confirmation and on-call alert. | Conditional update on the state that was read; otherwise 409. | `concurrency.e2e` | `48ba5de` |
| V-02 | Medium | Same race elsewhere: two approvals could create two dispatches; completions, follow-up answers and auto-dispatch could double-apply. | Conditional updates (auto-dispatch steps back quietly). | `concurrency.e2e` | `48ba5de` |
| V-03 | Medium | The web app sent no security headers: no Content-Security-Policy, could be framed (clickjacking), announced `X-Powered-By: Next.js`. | Per-request CSP with nonce; frame, content-type, referrer and permissions headers; HSTS in production. | `web-security.spec`; browser check | `0e9a99d` |
| V-04 | Medium | No limit on creating requests beyond 120/min, though each costs photo processing and a Gemini call. | 10 per address per 10 minutes. | `security.e2e` | `8652c28` |
| V-05 | Medium | Behind a load balancer every visitor would share one rate-limit bucket. | `TRUST_PROXY` setting; forged `X-Forwarded-For` ignored by default. | `security.e2e` | `8652c28` |
| V-06 | Medium | Demo mode was only blocked when `NODE_ENV=production`; a server with `NODE_ENV` unset and demo on would give sign-in links to anyone. | Demo mode also requires a local `WEB_URL`; the API refuses to start otherwise. | `demo-mode.e2e` | `f7c7b97` |
| V-07 | Medium | Personal data in logs: tenant emails and request text in notification log lines, the email in the mail warning, query values in database error messages. | Production logs carry ids only; errors reduced to class, code and reason. | `security.e2e` | `171b249` |
| V-08 | Low | CSRF relied only on `SameSite=Lax`, which also trusts other ports and subdomains. | Origin / Sec-Fetch-Site check on data changes. | `security.e2e` | `3d59447` |
| V-09 | Low | Bad request bodies: broken JSON echoed the parser's message; an oversized body caused a 500. | Plain 400 and a proper 413, with a request id. | `observability` | `65ad44c` |
| V-10 | Low | Demo links were not restricted by the client's address, so a dev machine reachable from another network would hand them out. | Demo links and accounts only for local clients. | `demo-mode.e2e` | `04f6424` |
| H-01 | Hardening | No raw SQL exists, but the coming pgvector search will need raw queries. | Guard test against string-built SQL. | `security.e2e` | `41c4df3` |

**10 vulnerabilities resolved** (V-01 to V-10), plus one preventive guard (H-01).

Checked in the audit and found sound, so no change was needed:
- access to other users' items (IDOR)
- session cookie flags
- the upload pipeline
- redirect safety
- the seed's refusal to run in production
- git history (secrets)
- what is sent to Gemini

## 3. Known gaps and accepted risks

- **`npm audit` (tooling only):** 32 findings (12 high, 20 moderate), none in code that handles requests.
  - **High (12):**
    - `braces` comes in through the ESLint and shadcn command-line tools; no fixed version exists.
    - `deepmerge-ts` comes in through the Prisma command-line tool. It is fixed only in 8.x, which Prisma 6 pins out, and forcing it broke every Prisma command.
    - Three of these count as production only because the Prisma CLI is installed for migrations.
  - **Moderate (20):** a newly published `sprintf-js` advisory in Jest's test tooling.
  - **Not applied:** the fixes `npm audit` suggests are downgrades to older major versions.
- **Demo mode reveals which emails have accounts** (known accounts get a link). This was accepted for local demos only, and is blocked in production and for non-local clients and URLs.
- **No CSRF token;** protection relies on `SameSite=Lax`, the CORS allow-list and the Origin check.
- **The web CSP allows inline styles** (`style-src 'unsafe-inline'`), which Next.js and the UI library need; styles can't run code.
- **The sign-in token is in the link's URL** (it stays in browser history). It is single-use, expires in 15 minutes, is never sent in a Referer, and needs a click to use.
- **Rate limits are in memory:** per server instance, reset on restart, and per address (tenants sharing one network share a limit).
- **Photos sent to Gemini** are re-encoded without metadata but may still show personal items (mail, a face).
- **Text a tenant tries to inject could reach the AI's summary for the vendor.** It is shown as plain text, next to the tenant's own words.
- **No MFA or "sign out everywhere"** for staff; sessions aren't bound to a device.
- **Email sending isn't wired up** (links are printed in development; in production nobody could sign in yet).
- **Uploaded photos aren't virus-scanned** (re-encoding removes most risk) and have no retention policy.
- **The audit log is append-only by convention,** not tamper-evident.
- **`SESSION_SECRET` is reserved and unused** (sessions are random tokens stored as hashes, so no signing key is needed).

## 4. How to re-check

| Command | What it checks |
|---|---|
| `npm run check` | Typecheck, lint and the 353 API tests, including every security test above |
| `npm run test:e2e` | Demo sign-in in a real browser against the running app (`npm run dev`, `DEMO_MODE="on"`) |
| `npm audit` / `npm audit --omit=dev` | Dependency findings (expected: the tooling items in section 3) |
