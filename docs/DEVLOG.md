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

## 2026-10-02 — Session 6: AI triage with Gemini

**Prompt:** Integrate Gemini (`@google/genai`, model from `GEMINI_MODEL`) for maintenance triage per SPEC §3.1–3.2
and §4: emergency rules before and after the AI (AI can raise, never lower an emergency); send only description,
cleaned photos and unit type; structured JSON validated with a shared Zod schema, invalid/failed/>15 s →
NEEDS_REVIEW; run after submit without making the tenant wait; save raw output, model and prompt version;
up to two follow-up questions from an approved bank, save answers and re-run; emergency instructions + on-call
notification; plain-word category/urgency for tenants. Tests with Gemini mocked; one real call on the seeded
leak request. Follow-up: guard against prompt injection (delimiters, data-only instruction, test).
Decisions: "no heat" emergency only in the DC heating season (Oct 1 – May 1, configurable); no hard-coded
utility phone numbers; follow-up answers multiple choice only; scrub phone/email/name from descriptions.

**Built**
- Migrations: `WorkOrder.emergencyRule`; `TriageResult.subIssue` + `followUpQuestionIds`.
- Shared: `TriageOutputSchema`, approved question bank (14 multiple-choice questions), `SubmitAnswersSchema`,
  plain-word labels, SLA hours, emergency instructions per rule.
- API `triage/`: emergency rules (7, each text checked separately), heating season, redaction, prompt
  (`triage-v1`, random-id BEGIN/END markers, marker spoofing neutralised, data-only system rules),
  `GeminiTriageModel` (JSON schema output, abort signal, fallback on 429/503), `withTimeout` (15 s),
  `TriageService` (background run, rules → AI → validate → rules again → max urgency, NEEDS_INFO / TRIAGED /
  NEEDS_REVIEW, TriageResult + audit + on-call notification, startup sweep for stuck requests).
- Submit runs the rules instantly (EMERGENCY + notification in the response); `POST /work-orders/:id/answers`.
- Web: emergency alert with steps and Call 911, "Our first look" (category + urgency in plain words),
  follow-up question form, auto-refresh while reviewing, "a coordinator will review it" for NEEDS_REVIEW.
- `npm run triage:once` (compiles to `build/`, so a running dev server isn't disturbed).
- Tests: 166 total. Mutation checks: letting the AI urgency win fails 4 tests; skipping redaction fails the
  privacy test.

**Real call** (`seed_wo_04`, "Small puddle under the bathroom sink every morning.", 2BR): `gemini-3.8-flash`
returned 429 → fell back to `gemini-3.5-flash-lite`, 4.5 s, valid JSON: PLUMBING / ROUTINE / 0.95,
"Bathroom sink leak", follow-ups `water_source` + `water_active` → NEEDS_INFO.

**Problems and fixes**
- `@google/genai` types are ESM-only (TS1479) though it ships CommonJS → ESM type import + `require`.
- Ceiling rule missed "through the bathroom ceiling" (the seeded emergency's wording) → allow 2 words between.
- Rules matched across joined texts ("ceiling" + "drips" from the AI summary) → check each text separately.
- The user's own `npm run dev` hot-reloaded the new code; its startup sweep made 4 real Gemini calls
  (the user's own request: 503 high demand; seed_wo_04, seed_wo_12 and a new user request: 15 s timeouts) →
  all NEEDS_REVIEW as designed. Added 503 to the fallback. seed_wo_04 was reset for the requested real call.
- Browser check used temporary DB-created requests (no AI) so no extra real calls were made; removed after.

**Time spent:** ~2 h 30 min

## 2026-10-02 — Session 7: swap triage models, 25 s timeout

**Prompt:** gemini-3.8-flash failed 4 of 5 times today. For development, make gemini-3.5-flash-lite the
primary and gemini-3.8-flash the fallback, both configurable in .env; raise the triage timeout to 25 s and make
it configurable; update .env.example and README; run tests; re-run triage on my two requests; commit.

**Built**
- Defaults: `GEMINI_MODEL` = gemini-3.5-flash-lite, `GEMINI_FALLBACK_MODEL` = gemini-3.8-flash; no retry when
  both are the same model. `TRIAGE_TIMEOUT_MS` (1000–120000, default 25000), read when the app starts.
- Updated both `.env.example` files, README (settings table), SPEC §5 and the model/timeout lines in the
  user's own `apps/api/.env` (other lines untouched).
- Tests: 170 passing (new: env settings, defaults, same-model guard, 25 s timeout with fake timers).

**Real calls** (`npm run triage:once -- <id> --rerun`, both answered by gemini-3.5-flash-lite):
- "water is leaking under my kitchen sink." (1 photo) → 1.8 s, PLUMBING / URGENT / 0.95, "Kitchen sink leak",
  follow-up `water_active` → NEEDS_INFO.
- "i smell gas in the kitchen" → 5.3 s, APPLIANCE / EMERGENCY / 0.99, "Gas smell in kitchen"; rule `gas-smell`
  also matched; AI asked `appliance_type` but emergencies skip questions → TRIAGED; still 1 on-call alert.

**Problems and fixes**
- Fallback tests failed because importing `@prisma/client` loads `apps/api/.env`, so tests saw the
  developer's real `GEMINI_MODEL`. The model tests now clear those variables around each test.

**Time spent:** ~30 min

## 2026-10-02 — Session 8: dev overlay "1 Issue" on tenant request pages

**Prompt:** The Next.js dev overlay shows "1 Issue" on the tenant request pages. Find the cause, fix it, run
the tests, check the page has no issues, commit. (The overlay text itself wasn't included in the message.)

**Cause:** `.next/dev/logs/next-development.log` showed 5 × `⨯ TypeError: fetch failed` from the web server
12 s after `npm run dev` restarted. The web app is ready in ~2 s but the API needs ~14 s to compile and start.
An open tenant request page re-rendered in that gap; its server-side calls to the API (`/me`, the request)
threw an unhandled network error, which the dev overlay reports as an issue.

**Fix**
- `lib/session.ts`: API calls from the server go through `apiFetch()`. If the API can't be reached, redirect
  to `/unavailable?next=<current page>` instead of throwing. `proxy.ts` passes the current path in a header.
- `/unavailable`: "Reconnecting to LeaseLens…" page that checks `/health` every 3 s (about 2 min), then returns
  to the page; manual "Try again now"; 911 reminder; works at 390px.
- `safeReturnPath()` in shared: only same-site paths, so `next=` can't be used as an open redirect.

**Checks:** 183 tests passing (new: safeReturnPath). Browser on the user's running dev server: all tenant
pages and states (list, new, detail, NEEDS_INFO, auto-refresh, client navigation) show no overlay issues and
no console errors; the dev log has no new errors. API-down simulation (production build on :3001 pointed at
an unused port, then a stub API brought up): 8/8 checks — redirect to /unavailable, reconnect and return,
`next=//evil.example` stays on site, no JS errors.

**Time spent:** ~45 min

## 2026-10-03 — Session 9: staff triage queue, overrides, vendor dispatch, vendor jobs

**Prompt:** Build the staff triage queue and vendor dispatch from SPEC §3.3: /staff queue for coordinators and
managers (sorted EMERGENCY → URGENT → ROUTINE, oldest first; description, building/unit, AI category, urgency,
confidence, status, age, photo count; urgency/status filters); staff request detail (photos, answers, vendor
summary, emergency rule, triage history); override with required reason saved in TriageResult + audit (actor
from the session; lowering an emergency needs a reason and is clearly logged); top-3 vendor matching with
reasons and one-click approve; auto-dispatch under AUTO_DISPATCH_LIMIT_USD, visible and logged; vendor job page
(own jobs only, complete with note + optional photo; tenant sees Completed); notifications on dispatch and
completion; tests. Decisions: estimated hours per trade, auto-dispatch conditions (confidence ≥ 0.8), unknown
urgency between URGENT and ROUTINE, each override a new TriageResult row, lowering an emergency needs 20+
characters + confirmation + on-call alert. Follow-up: vendors get their own `/vendor` area (land on
`/vendor/jobs`; vendor ↔ tenant areas redirect), role-redirect tests updated.

**Built**
- Shared: `areaForRole` / `homePathForRole` (VENDOR → `/vendor/jobs`), `rankVendors`, `estimateCostUsd`,
  `autoDispatchDecision`, queue/staff/vendor schemas, override/dispatch/complete schemas.
- Migration `dispatch_estimate_and_reason` (`Dispatch.estimatedCostUsd`, `matchReason`).
- API: `StaffModule` (queue, staff detail, override), `DispatchModule` (matches, approve, auto-dispatch,
  vendor jobs + complete), `NotificationsModule`. Triage runs auto-dispatch after TRIAGED and no longer
  overwrites a request a coordinator changed while the AI was running (kept as `triage.ai.stale`).
  Photo route allows vendors only for jobs dispatched to them. Reusable `PhotoUpload(field, max)` interceptor.
- Web: `/staff` queue (table on desktop, cards on phones, filters, empty/loading/error),
  `/staff/work-orders/[id]` (details, history, override form with emergency-lowering safeguard, vendor panel),
  `/vendor/jobs` + `/vendor/jobs/[id]` (phone-first, complete form with photo), tenant "Completed" note.
  Area layouts redirect a wrong-role user on the server before anything renders.
- Seed: work orders now store their emergency rule; 3 seeded rows in the dev DB updated to match.
- Tests: 250 passing (new: dispatch-units 26, staff e2e 25, vendor e2e 13, summary + seed checks).
  Mutation checks: removing the vendor ownership check fails the cross-vendor test; recording no override
  actor fails the session test (a body `overriddenById` is already dropped by the Zod schema).

**Browser (Edge, against Neon, no AI calls):** 26/26 checks as coordinator (desktop + 390px), vendor and tenant:
queue order and filter, override saved with the session coordinator, emergency-lowering warning blocks without
confirmation, only pest vendors suggested for a pest job, approve → DISPATCHED + notification, vendor sees only
own job, other vendor's job "not found", vendor/tenant area redirects, complete with photo → 2 notifications,
tenant sees "Completed". Seeded rows restored and test rows/photos removed afterwards.

**Problems and fixes**
- Dropdowns inside `<label>` got accessible names like "Urgency Emergency Urgent Routine" → explicit
  `htmlFor`/`id` labels.
- Seeded emergencies had no `WorkOrder.emergencyRule` (column added after seeding) → seed + 3 rows fixed.
- Wrong-area redirects happened only after streaming started (header flashed) → layouts redirect first.
- Seed rows store AI output directly and record overrides on the AI row → AI vs human rows are now told
  apart by `model === "human"`, and the vendor summary reads both formats.

**Time spent:** ~3 h

## 2026-10-03 — Session 10: submission clean-up

**Prompt:** Organize the project for submission: clean structure, professional README (problem, stack, features,
Windows setup, Neon + Gemini how-to, scripts, demo accounts, responsible-AI rules, known limitations incl. no
Gas/utilities category and AI confidence shown after overrides, next phase), complete `.env.example` files with
placeholders only, no secrets in git history, npm audit / typecheck / lint / tests fixed, security checklist,
commit and push to GitHub. Follow-up: pino with cookie/authorization redaction; no license file; revert the
Jest 30 upgrade or deepmerge-ts override if either breaks anything.

**Done**
- Secrets: scanned all 9 commits for key/password/host patterns and for the actual values in `apps/api/.env`
  (without printing them) — none found; only placeholder `.env.example` files were ever committed.
- npm audit: 39 high → 12 (production 10 → 3). Jest 29 → 30 (all tests pass); `shadcn` moved to
  devDependencies (build-time CSS only). Remaining: `braces` via ESLint/shadcn CLI (no fixed version exists)
  and `deepmerge-ts` via the Prisma CLI.
- Reverted: the `deepmerge-ts` 8 override — Prisma 6 pins 7.1.5 exactly and npm then left the package out,
  breaking every Prisma command. Package files restored; documented as a known finding.
- API error handling: pino structured logs via `nestjs-pino` with request ids (`X-Request-Id`, also in every
  error body), cookie/Set-Cookie/Authorization redaction, short request lines, `/health` not logged; startup
  settings check with clear messages (fail fast); shutdown hooks; unhandled-rejection logging; `zod` declared.
- Web: `global-error.tsx`; server errors show a short reference from the request id.
- `.env.example` files rewritten: every setting the code reads, placeholders only, one comment each;
  `SESSION_SECRET` documented honestly as reserved (unused); test checks they parse, pass the startup check
  and contain no real-looking keys.
- Root scripts `typecheck` and `check`. README rewritten for reviewers, with a security checklist.
- Checks: `npm run check` (typecheck + lint + 270 tests) passes; API started with the real `.env` and a request
  carrying a fake session cookie and bearer token → request id in header, body and log, secrets not logged;
  browser smoke test of all five roles at 390px: 20/20.

**Problems and fixes**
- `z.url()` accepted `localhost:3000` (scheme "localhost:") → require http/https.
- An isolation test compared two error bodies exactly; they now differ by request id → compare without it.
- The user's dev servers stopped during this session (likely the package installs replacing files under
  them); restarted for the smoke test and stopped again.

**Time spent:** ~1 h 30 min

## 2026-10-04 — Session 11: demo mode

**Prompt:** Add a clearly labelled demo mode for local use: with DEMO_MODE="on" and NODE_ENV not production, the
request-link response for a known account also returns the sign-in link and "Check your email" shows "Demo mode
— in the live app this link is emailed" with a "Sign in now" button; the sign-in page lists the five demo
accounts as one-click buttons; unknown emails get exactly the same response with no link; rate limits stay on;
the API refuses to start with DEMO_MODE on in production; .env.example (default "off"), README, tests. The user
accepted that demo mode reveals which emails have accounts (local only, blocked in production).

**Built**
- Shared: `DEMO_ACCOUNTS` (the five seeded users), `RequestLinkResponseSchema` (optional `demo.signInUrl`),
  `DemoInfoSchema`.
- API: `isDemoMode()` (DEMO_MODE="on" and NODE_ENV ≠ production, checked on every use); startup check rejects
  demo mode in production and values other than on/off; request-link waits for the link only in demo mode and
  returns it for known accounts under the per-email limit; `GET /auth/demo` lists accounts only in demo mode.
- Web: demo accounts box on the sign-in page; demo sign-in box with one-click "Sign in now" (calls
  `POST /auth/verify` directly); falls back to normal behaviour if the API is unreachable.
- `DEMO_MODE="off"` in the API and root `.env.example` (pointer in the web one); README section + security notes;
  SPEC §7 lists `GET /auth/demo`.
- Tests: 15 new (no link when off / unset / production / unknown email / over the per-email cap; the link signs
  in; IP rate limit still 429; `/auth/demo` only in demo mode; startup rule; demo accounts match the seed).
  Mutation check: ignoring NODE_ENV fails 3 tests. 285 total.

**Checks:** API with NODE_ENV=production + DEMO_MODE=on exits with the config error. Browser (a demo copy on
:3001/:4101; the user's own :3000/:4100 left running with demo off): demo buttons, unknown email → no link,
one-click sign-in for tenant, coordinator, vendor and manager, 6th request → "Too many attempts"; demo off →
no buttons and no link for a known account. 15/16 checks; the 16th flagged the browser's console note for the
intended 429, not an app error.

**Time spent:** ~1 h
