# LeaseLens

**AI-assisted maintenance triage for apartment buildings.** Tenants report a problem from their phone in a minute;
LeaseLens spots emergencies instantly, has Gemini sort and summarize the request, and lets coordinators dispatch
the right vendor with one click — while people stay in charge of every decision that matters.

> Workshop 5.2 use case (PropTech). Pilot customer: Capital Residential Partners (fictional), ~2,000 apartments
> in Washington, DC. Product spec: [docs/SPEC.md](docs/SPEC.md) · Build log: [docs/DEVLOG.md](docs/DEVLOG.md)

**Contents:** [Problem](#the-problem) · [Features](#what-it-does) · [Tech stack](#tech-stack) ·
[Setup on Windows](#setup-on-windows) · [Scripts](#scripts) · [Demo accounts](#demo-accounts) ·
[Responsible AI](#responsible-ai-rules) · [Security](#security-checklist) · [Testing](#testing) ·
[Limitations](#known-limitations) · [Next phase](#next-phase) · [Troubleshooting](#troubleshooting)

---

## The problem

Maintenance requests arrive vague — *"it's leaking"*. Coordinators call tenants back to find out where, how bad
and since when; the wrong trade gets sent; and a gas smell can sit in the same queue as a dripping faucet. Every
callback and wasted truck roll costs money, and a slow response to a real emergency can cost much more.

## What it does

| Area | Who | Built |
|---|---|---|
| **Tenant intake** | Tenants (`/tenant`) | Phone-first form: description, up to 3 photos (checked by content, auto-rotated, location metadata stripped), permission to enter, access notes. "My requests" list with plain-word status. |
| **AI triage with emergency rules** | Automatic | Keyword rules catch gas, fire/smoke, ceiling leaks, flooding, sparks, no heat in the heating season and vulnerable lockouts **before** any AI — the tenant sees emergency steps and on-call is alerted immediately. Gemini then returns category, urgency, confidence, a vendor summary and up to 2 follow-up questions from an approved bank. The rules run again on the AI's output; the AI can raise urgency but never lower an emergency. Failures, invalid output or a timeout → a person reviews it. |
| **Follow-up questions** | Tenants | Up to two multiple-choice questions on the request page; answers re-run triage once. |
| **Staff queue & dispatch** | Coordinators, managers (`/staff`) | Queue sorted emergencies → urgent → not yet triaged → routine, oldest first, with filters. Request page with photos, answers, AI summary, matched rule and full triage history. Override category/urgency with a required reason (lowering an emergency needs extra confirmation). Top-3 vendor matches by trade, availability, first-time-fix rate and cost, with reasons; one-click approve. Low-cost routine jobs can auto-dispatch under a configurable limit — visibly and logged. |
| **Vendor jobs** | Vendors (`/vendor`) | Only their own jobs: summary, photos, unit and address, permission to enter, access notes. Mark complete with a note and optional photo; the tenant then sees "Completed". |
| **Sign-in** | Everyone | Passwordless magic link (printed in the API terminal in development), 7-day session, each role sent to its own area. |
| **Audit trail** | Staff / reviewers | Every AI decision (model, prompt version, raw output), override, dispatch and completion is in `audit_log`; notifications in `notifications`. |

## Tech stack

| Layer | Technology |
|---|---|
| Monorepo | npm workspaces: `apps/web`, `apps/api`, `packages/shared` |
| Web | Next.js 16 (App Router, TypeScript), Tailwind CSS 4, shadcn/ui |
| API | NestJS 11, Prisma 6, Zod 4, pino structured logging (`nestjs-pino`) |
| Database | Neon serverless PostgreSQL with `pgvector` |
| AI | Google Gemini via `@google/genai` (structured JSON output) |
| Images | sharp (re-encode, auto-rotate, strip EXIF) |
| Tests | Jest 30 + supertest (API, with an in-memory database and a fake Gemini) |

```
apps/
  api/            NestJS API — src/{auth,work-orders,triage,dispatch,staff,vendor,storage,…}, prisma/, test/
  web/            Next.js app — src/app/{tenant,vendor,staff,signin,auth,unavailable}
packages/
  shared/         Zod schemas, rules and types used by both apps (validation runs in browser and API)
docs/             SPEC.md (source of truth) and DEVLOG.md (session log)
```

## Setup on Windows

**You need:** [Node.js 20.12+](https://nodejs.org) (tested on 24 LTS) and [Git for Windows](https://git-scm.com).
Commands below work in PowerShell or Git Bash.

### 1. Get the code and install

```sh
git clone https://github.com/redietg0105/Leaselens.git
cd Leaselens
npm install
```

### 2. Get a Neon database URL

1. Sign up at [neon.tech](https://neon.tech) and create a project (any region).
2. Open **Connect** on the project dashboard and copy **two** connection strings for the `neondb` database:
   - **Pooled** — with *Connection pooling* on (the host contains `-pooler`) → `DATABASE_URL`
   - **Direct** — with *Connection pooling* off → `DIRECT_URL` (migrations need a direct connection)
3. Nothing else to configure — the first migration enables the `vector` extension.

### 3. Get a Gemini API key

1. Go to [Google AI Studio → API keys](https://aistudio.google.com/apikey) and sign in with a Google account.
2. **Create API key** and copy it → `GEMINI_API_KEY`.
   Without a key the app still runs; AI triage just fails safely and every request goes to a person.

### 4. Create your local settings

```powershell
copy apps\api\.env.example apps\api\.env
copy apps\web\.env.example apps\web\.env.local
```

Open `apps/api/.env` and paste your `DATABASE_URL`, `DIRECT_URL` and `GEMINI_API_KEY`. Every other value has a
working default and a comment explaining it. These files are gitignored — never commit them. The API checks the
settings when it starts and tells you exactly what's missing or malformed.

### 5. Create the tables, load demo data, run

```sh
npm run db:migrate   # creates all tables in Neon
npm run db:seed      # loads fictional demo data (WIPES the database first)
npm run dev          # web on http://localhost:3000, API on http://localhost:4100
```

Open http://localhost:3000, choose **Tenant** or **Staff**, and sign in with a [demo account](#demo-accounts).
The sign-in link appears in the **API terminal** (look for `Sign-in link for …`); open it and press **Sign in**.
Or turn on [demo mode](#demo-mode-local-only) to sign in from the browser with one click.

## Scripts

Run from the repo root.

| Command | What it does |
|---|---|
| `npm run dev` | Builds shared code, then runs shared (watch), API (:4100) and web (:3000) together |
| `npm run build` | Production build of shared, API and web |
| `npm test` | All API tests (Jest) — no network, no database needed |
| `npm run typecheck` | TypeScript check of shared, API (incl. tests) and web |
| `npm run lint` | ESLint for the web app |
| `npm run check` | typecheck + lint + tests in one go |
| `npm run db:migrate` | Apply / create Prisma migrations (uses `DIRECT_URL`) |
| `npm run db:seed` | **Wipe** the database and load demo data |
| `npm run db:studio` | Browse the tables in Prisma Studio (http://localhost:5555) |
| `npm run triage:once -w @leaselens/api -- <workOrderId> --rerun` | One **real** Gemini triage call for one request; prints what was sent and received |
| `npm run db:deploy -w @leaselens/api` | Apply migrations without prompts (for deployment) |

## Demo accounts

All fictional (`.test` addresses can't receive mail). Created by `npm run db:seed`.

| Role | Email | Lands on | Notes |
|---|---|---|---|
| Tenant | `tenant@leaselens.test` | `/tenant` | Jordan Ellery, unit A-302 — has seeded requests |
| Vendor | `vendor@leaselens.test` | `/vendor/jobs` | Sam Thornbury, Capital Flow Plumbing — has one assigned job |
| Coordinator | `coordinator@leaselens.test` | `/staff` | Riley Castellan — queue, overrides, dispatch |
| Manager | `manager@leaselens.test` | `/staff` | Morgan Pell — same staff tools |
| Leasing | `leasing@leaselens.test` | `/staff` | Avery Lindqvist — lease tools are the next phase |

### Demo mode (local only)

To let someone try LeaseLens without watching the API terminal, set this in `apps/api/.env` and restart:

```ini
DEMO_MODE="on"
```

- The sign-in page shows the five demo accounts as one-click buttons that fill in the email.
- After **Email me a sign-in link**, a highlighted box says *"Demo mode — in the live app this link is emailed"*
  with a **Sign in now** button — no inbox or terminal needed.
- Unknown emails still get exactly the normal response (no link), and the rate limits still apply.
- **Trade-off (accepted for local demos):** because known accounts get a link and unknown ones don't, demo mode
  reveals which emails have an account. Never turn it on where real people's accounts exist.
- It can't reach production: demo mode only works when `NODE_ENV` isn't `production`, and the API refuses to
  start with `DEMO_MODE="on"` in production. The default is `"off"`.

The demo data has 4 buildings, 40 units, 8 vendors across all trades and 12 work orders covering every urgency
and status, including three emergencies (ceiling leak, gas smell, sparking outlet).

## Responsible AI rules

From [CLAUDE.md](CLAUDE.md) and SPEC §4 — how each is enforced, and where it's tested (`apps/api/test`).

| Rule | How it's enforced | Tested in |
|---|---|---|
| Emergency rules run **before and after** the AI; the AI can raise urgency, never lower an emergency | `triage/emergency-rules.ts` runs on submit (instant) and again on the AI's own text; final urgency = the higher of rule and AI | `triage.e2e`, `triage-units` (incl. a mutation check) |
| **No personal data to the AI** | Only the description, cleaned photos, unit type and multiple-choice answers are sent; phone numbers, emails and the tenant's name are scrubbed from the text first; access notes, unit number and building never leave | `triage.e2e` › privacy (inspects the exact request) |
| **Prompt injection** can't steer triage | Tenant text sits between random-id BEGIN/END markers, fake markers are neutralized, the model is told it's data only; rules still floor emergencies | `triage.e2e` › prompt injection, `triage-units` |
| **Every AI response is validated**; invalid → `NEEDS_REVIEW`, never a crash | Shared Zod schema; question ids must be in the approved bank; 25 s timeout; fallback model on 429/503 | `triage.e2e`, `triage-units` |
| **People decide**: actor and approver come from the session, never the request | Overrides, dispatch approvals, completions and the audit log read the signed-in user; body fields like `overriddenById` are dropped | `staff.e2e` (incl. impostor ids in the body) |
| **Lowering an emergency is deliberate and visible** | Needs a 20+ character reason and confirmation; logged as `triage.override.emergency-lowered`; on-call alerted | `staff.e2e` |
| **Model, prompt version, raw output and overrides are stored** | `triage_results` + `audit_log` for every AI run and human change | `triage.e2e`, `staff.e2e` |
| **Role checks on the server** for every endpoint | Global guards, deny by default; role read from the database on each request | `roles.e2e`, `staff.e2e`, `vendor.e2e` |
| Lease answers cite lease + page | Lease Q&A is the next phase | — |

## Security checklist

**In place**
- Passwordless sign-in: 256-bit one-time links (15 min), only SHA-256 hashes stored, atomic single use, the same
  response for unknown emails (the link is issued in the background so response time doesn't reveal it either), rate limits (5 link requests/IP and 3/email per 15 min).
- Sessions: random token in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production), 7-day expiry checked
  on every request, sign-out deletes the session.
- Authorization: global deny-by-default guards; role from the database each request; tenants and vendors get
  `404` for anything not theirs (tested, including photos).
- Validation: shared Zod schemas on every body, query and AI response; startup check of all settings.
- Uploads: type checked by file content, 5 MB / 3-photo limits, 40-megapixel cap, re-encoded (strips GPS/EXIF),
  server-generated storage keys (no path tricks), served only through an access-checked route.
- HTTP: Helmet headers, CORS limited to the web app, central error handler (JSON, no stack traces) with a
  request id in every error and log line; same-site-only return paths (no open redirects).
- Logging: structured pino logs; cookies, `Set-Cookie` and `Authorization` are redacted (tested).
- Demo mode (sign-in links shown in the browser) is off by default, only works outside production, and the API
  refuses to start with it on in production (tested).
- Secrets: only placeholder `.env.example` files are tracked; `.env`, `uploads/` and build output are gitignored;
  git history scanned — no keys, passwords or database hosts in any commit.

**Gaps (known, for the next phase)**
- With `DEMO_MODE="on"` the sign-in page reveals which emails have accounts — acceptable for local demos only.
- Email sending isn't wired up — in production nobody could sign in yet (links are only printed in development).
- Rate limits are in memory: per server instance and reset on restart; behind a proxy, set the trusted proxy so
  real client IPs are used.
- No CSRF token — relies on `SameSite=Lax`, the CORS allow-list and JSON/multipart bodies (fine while web and API
  share a site; revisit for other deployments).
- No Content-Security-Policy on the web app yet.
- No MFA or "sign out everywhere" for staff; sessions aren't bound to a device.
- Uploaded photos aren't virus-scanned (re-encoding removes most risk) and have no retention policy.
- The audit log is append-only by convention, not tamper-evident.
- `npm audit` reports 12 high findings, all in tooling rather than code that handles requests (3 of them count as production only because `@prisma/client` lists the Prisma CLI as a peer): `braces` via ESLint/shadcn CLI (no fixed
  version exists yet) and `deepmerge-ts` via the Prisma CLI (fixed only in 8.x, which Prisma 6 doesn't accept —
  forcing it broke Prisma). Neither processes user input.

## Testing

`npm test` runs **285 API tests** in about 10 seconds — no network or database: the API runs against an
in-memory fake of Prisma and a fake Gemini that records exactly what would be sent. Covered: sign-in and
sessions, role guards, tenant and vendor isolation, validation and photo rules, every emergency rule and the
heating season, AI success/failure/timeout/invalid output, privacy and prompt injection, follow-ups, overrides,
vendor ranking and auto-dispatch limits, vendor completion, demo mode (never a link outside demo mode, in production or for unknown emails), request ids, log
redaction and settings checks.
Several safety tests were checked by deliberately breaking the rule they guard (see DEVLOG).

Each feature was also checked in a real browser (Edge, desktop and 390 px phone width) against Neon, using
temporary scripts that weren't committed.

## Known limitations

- **No Gas/utilities category.** A gas smell is caught by the emergency rule (instructions + on-call alert), but
  triage files it under Appliance/Other and no vendor trade covers gas lines — the utility must be called by a person.
- **AI confidence is still shown after a staff override.** The queue and request page show the last AI
  confidence even when a coordinator has changed the category or urgency, which can make the AI look more
  certain about a value it didn't choose.
- Triage runs inside the API process (with a startup sweep for anything interrupted) — production should use a
  job queue (e.g. Cloud Tasks).
- "No heat" uses the calendar heating season, not the outdoor temperature.
- Vendors don't see the tenant's phone number; "call first" means calling the coordinator.
- Users exist only through the seed — there's no invite or admin page yet.
- Notifications are written to the database and the log; nothing is actually emailed or texted.
- The web app has no automated tests of its own yet (browser checks were scripted by hand).
- Times are shown in Washington, DC time; English only.
- `SESSION_SECRET` is reserved and not used yet (sessions don't need signing).

## Next phase

1. **Lease abstraction** — upload lease PDFs; Gemini extracts terms with page and quote; leasing staff verify each
   one; lease Q&A that always cites lease + page or says "Not found in the lease"; 90/60/30-day deadline alerts.
2. **Recurring-issue detection** — embed each request (`gemini-embedding-001`, pgvector) and flag 3+ similar
   requests in the same building or stack within 90 days.
3. **Manager dashboard** — open work by urgency, median time to triage, emergencies escalated, repeat issues,
   upcoming lease dates.
4. **Email sending** — real sign-in links and notifications (SendGrid / Twilio).
5. **Invite-tenant page** — staff create tenant and vendor accounts instead of relying on the seed.
6. **Cloud Run deployment** — web and API as two services, Cloud Storage for photos, Cloud Tasks for triage,
   Secret Manager for keys, a shared parent domain for the session cookie.

## Troubleshooting

- **The API won't start** — it prints `[config] The API cannot start:` with the exact setting to fix in
  `apps/api/.env`.
- **"Too many requests" when signing in** — 5 link requests per IP per 15 minutes. Restart the API to reset in
  development.
- **Port 4000 / empty replies** — the API uses 4100 because NoMachine (`nxd`) listens on 4000 on some machines.
  Check with `netstat -ano | findstr :4100`.
- **`EPERM … query_engine-windows.dll.node`** during `prisma generate` — a running API has Prisma's engine open.
  Stop `npm run dev` and run it again.
- **`db:migrate` asks for a migration name although nothing changed** — someone added an index Prisma can't
  describe (e.g. HNSW on `embeddings.vector`); Prisma 6 sees it as drift.
- **"Reconnecting to LeaseLens…"** — the web app can't reach the API (usually still starting). It reconnects by
  itself.
