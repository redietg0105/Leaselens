# LeaseLens dev log

## 2026-10-01 — Session 1: monorepo scaffold

**Prompt:** Build the project skeleton from docs/SPEC.md and CLAUDE.md — npm workspaces (web, api, shared),
.env.example files, .gitignore, one `npm run dev` (web :3000, api :4000), placeholder landing page with
Tenant/Staff entry points, `GET /health`, git init + first commit.

**Built**
- Root npm workspaces with `concurrently`-based `npm run dev`, shared `tsconfig.base.json`, `.gitignore`, `.env.example`.
- `packages/shared`: Zod enums (Role, Urgency, Category) and `HealthResponseSchema`; compiles to CommonJS.
- `apps/api`: NestJS 11 with Helmet, CORS limited to `WEB_URL`, JSON-only global error filter, `GET /health`.
  Prisma 6 schema with the pgvector extension (no models yet). 3 Jest/supertest tests.
- `apps/web`: Next.js 16 + Tailwind 4 + shadcn/ui (Button, Card). Landing page, `/tenant` and `/staff`
  placeholders, error boundary and 404 page. Checked at 390px and desktop width.

**Problems and fixes**
- NestJS 12 is ESM-only and doesn't work with Jest/ts-jest → pinned NestJS 11 (CommonJS).
- `tsx` can't emit decorator metadata (Nest DI) → API dev uses `nest start --watch`.
- TypeScript warns that `moduleResolution: node` is deprecated → switched to `node16`.
- npm 11 blocks install scripts → approved only `prisma`, `@prisma/engines`, `@prisma/client`.
- The Next.js `.gitignore` ignored `apps/web/.env.example` → added `!.env.example`.
- shadcn theme expected `--font-sans`, layout set `--font-geist-sans` → serif fallback; fixed.
- Port 4000 is also used by NoMachine (`nxd`) on this machine, which captured requests. Verified the API
  on port 4100 instead; see README troubleshooting.
- Known: `npm audit` reports 3 high issues in `deepmerge-ts` via the Prisma CLI (dev-only, no safe fix yet).

**Time spent:** ~1 h

## 2026-10-01 — Session 2: move API to port 4100

**Prompt:** Move the API to port 4100 everywhere so it doesn't clash with NoMachine on 4000; run tests,
start `npm run dev`, confirm `/health`, commit.

**Built:** API default `PORT` is now 4100. Updated the root, API and web `.env.example` files, README
(port note), SPEC (new "Local ports" line) and the CLAUDE.md commands. CORS unchanged — it allows the
web origin (`WEB_URL`, :3000), not the API port.

**Time spent:** ~10 min

## 2026-10-01 — Session 3: database and data model

**Prompt:** Set up the database and create the data models from SPEC section 6 with Prisma and Neon. Wire
DATABASE_URL (pooled) and DIRECT_URL (direct, migrations) without printing them; enable pgvector in a
migration with `vector(768)`; add db:migrate / db:seed; seed fictional sample data; open Prisma Studio;
add DIRECT_URL to .env.example; run tests; commit.

**Built**
- `schema.prisma`: 19 models/tables (snake_case), 11 enums, `url` + `directUrl`. Tokens and sessions store
  hashes only. TriageResult keeps raw output, validity, model, prompt version and override. LeaseTerm keeps
  page, quote, confidence, status and the original AI value.
- Migrations: `init` (creates the `vector` extension and `embeddings.vector vector(768)`), then
  `drop_vector_hnsw_index`.
- Seed (`prisma/seed-data.ts` pure + `prisma/seed.ts` writer): 4 buildings, 40 units, one user per role
  (tenant in A-302), 8 vendors, 12 work orders including emergencies, a needs-review case, an override,
  an auto-dispatch and a 3-leak cluster in stack A-02. Lease PDFs deferred to the lease feature.
- Tests: Prisma enums match shared Zod enums; 14 seed-data checks. 20 tests total.

**Problems and fixes**
- First `migrate dev` "hung": it was an invisible interactive prompt asking to name a new migration,
  because Prisma 6 saw my hand-added HNSW index as drift. The orphaned process then held Prisma's
  advisory lock. Killed it, and dropped the index in a second migration (exact scan is fine at MVP scale).
- Prisma warns that `package.json#prisma` (seed config) is deprecated in Prisma 7 — fine on Prisma 6.

**Time spent:** ~45 min

## 2026-10-02 — Session 4: magic-link authentication

**Prompt:** Add passwordless magic-link sign-in per SPEC using the MagicLinkToken and Session tables (hashed
tokens only): same "check your email" response for any email, dev link printed in the API terminal, 15-minute
one-time links, 7-day httpOnly SameSite session cookie checked on every request, sign-out deletes the session,
rate-limited request-link, role guards on every API route (role from the database), redirect tenants/vendors
to /tenant and staff to /staff, header with signed-in user + sign-out, cookie working across :3000 and :4100.
Tests: tenant blocked from staff endpoint, expired/reused link rejected, unknown email same response.

**Built**
- API: `AuthModule` (`POST /auth/request-link`, `POST /auth/verify`, `POST /auth/logout`, `GET /me`),
  `PrismaModule`, `MailService` (prints link in dev). Global guards: throttler → `SessionGuard` → `RolesGuard`
  (deny by default; routes must be `@Public()` or `@Roles(...)`). `/health` stays public.
- Link issuing runs in the background so response time doesn't reveal whether an account exists. Max 3 links
  per email per 15 minutes; 5 request-link calls per IP per 15 minutes; verify 20/min.
- Verify is a single atomic `updateMany` (unused + unexpired) so a link can't be used twice.
- Migration `drop_session_revoked_at` (sign-out deletes the row instead).
- Web: `/signin`, `/auth/verify` (click to confirm), `proxy.ts` (no cookie → /signin), `requireArea()` in each
  protected page, header with name/role and sign-out. SPEC §7 now says `POST /auth/verify`.
- Tests: 52 total (in-memory fake database, no network). Browser check against Neon with seeded users: 16 checks, all passing.

**Problems and fixes**
- Emails with surrounding spaces were rejected: Zod validated before trimming → trim/lowercase first.
- API crashed on start ("No driver (HTTP)"): after new installs npm left `@nestjs/platform-express` nested
  under `apps/api` while `@nestjs/core` was hoisted. Tests still passed because `@nestjs/testing` was nested
  next to it. Removed the nested entries and reinstalled so all Nest packages sit together.
- Playwright `getByRole('alert')` matched Next's hidden route announcer; checked the message text instead.
- Rate limit message was "ThrottlerException: Too Many Requests" → friendlier message.

**Time spent:** ~1 h 30 min

## 2026-10-02 — Session 5: tenant maintenance requests

**Prompt:** Tenant "New request" form (description 10–1000 chars, up to 3 JPG/PNG/WebP photos ≤ 5 MB with
previews and remove, permission to enter yes/no/call first, optional access notes); storage service writing
to uploads/ in dev; store only the path; serve photos only to allowed users; shared Zod validation in browser
and API; check file type by content; unit from the database; status SUBMITTED; no AI yet; "My requests" list
and detail with empty/loading/error states; tenant isolation; 390px. Tests, browser check, commit.
Follow-up: auto-rotate photos from EXIF orientation before stripping metadata; approve only sharp if needed.

**Built**
- Migration `work_order_entry_and_media_meta`: `EntryPermission` enum, `WorkOrder.entryPermission`,
  `accessNotes`, `WorkOrderMedia.contentType` / `sizeBytes`, index on `(createdById, createdAt)`.
- Shared: `CreateWorkOrderSchema`, photo limits, `detectImageType()` (magic bytes, runs in browser + Node),
  response schemas, tenant-facing status labels.
- API: `POST /work-orders` (multipart, TENANT), `GET /work-orders/mine` (TENANT), `GET /work-orders/:id` and
  `GET /work-orders/:id/media/:mediaId` (own request for tenants; coordinators/managers any). Another
  tenant's request is a 404. `StorageService` + `LocalStorageService` (server-generated keys only). Photos:
  sharp `rotate()` + re-encode (strips EXIF/GPS), 40 MP input cap, long edge ≤ 2560 px. Files removed again
  if the DB write fails. `workorder.create` audit entry with the actor from the session. Helmet CORP set to
  `same-site` so the web app can show API photos.
- Web: `/tenant` "My requests" (empty state, skeleton, error with retry), `/tenant/requests/new`,
  `/tenant/requests/[id]` (+ loading, not-found). Root error page uses Next 16 `retry()`.
- Seed: removed the two photo rows that pointed at files that never existed.
- Tests: 94 total (validation rules, content sniffing, unit from DB, tenant-only access, cross-tenant 404,
  EXIF stripping + rotation, orphan cleanup). Mutation check: removing the ownership check fails the
  cross-tenant test. Browser (Edge, 390px, Neon): 22 checks passed.

**Problems and fixes**
- sharp needed no install script (prebuilt binaries), so nothing to approve.
- Lint: updating a ref during render → moved into an effect.
- Ports 3000/4100 were held by the user's own `npm run dev`; used those servers instead of killing them,
  and issued test sign-in tokens directly in the DB because their API terminal wasn't readable.
- First browser run had false failures from missing waits (including a fetch of an `undefined` photo URL
  that returned 200 from Next); added waits and a guard, all checks then passed with real URLs.
- Test data (2 requests, 4 photo files, a temporary second tenant) removed afterwards; the user's own
  request created during the session was left in place.

**Time spent:** ~2 h
