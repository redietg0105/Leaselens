# LeaseLens

AI maintenance triage and lease abstraction for property managers (local MVP).
Product spec: [docs/SPEC.md](docs/SPEC.md). Agent rules: [CLAUDE.md](CLAUDE.md).

## Structure

| Path | What |
|---|---|
| `apps/web` | Next.js (App Router) + Tailwind + shadcn/ui — `/tenant/*` and `/staff/*` |
| `apps/api` | NestJS + Prisma REST API |
| `packages/shared` | Zod schemas and types used by both |

## Setup

Requires Node 20.12+ (developed on Node 24).

```sh
npm install
# then create your local env files from the examples (never commit them):
#   apps/api/.env       <- apps/api/.env.example
#   apps/web/.env.local <- apps/web/.env.example
npm run db:migrate   # create tables in Neon (needs DATABASE_URL and DIRECT_URL)
npm run db:seed      # load fictional sample data (wipes existing data)
npm run dev
```

- Web: http://localhost:3000
- API: http://localhost:4100/health

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Builds `packages/shared`, then runs shared (watch), api (:4100) and web (:3000) together |
| `npm test` | API tests (Jest + supertest) |
| `npm run build` | Production build of all workspaces |
| `npm run lint` | Lint the web app |
| `npm run db:migrate` | Apply migrations / create a new one after editing `schema.prisma` (`prisma migrate dev`) |
| `npm run db:seed` | **Wipe** the database and load fictional sample data (4 buildings, 40 units, 5 users, 8 vendors, 12 work orders) |
| `npm run db:studio` | Browse the tables in Prisma Studio (http://localhost:5555) |

## Signing in (development)

1. Open http://localhost:3000/signin and enter a seeded email, e.g. `tenant@leaselens.test` or
   `coordinator@leaselens.test` (others: `vendor@`, `leasing@`, `manager@leaselens.test`).
2. The sign-in link is printed in the **API terminal** (no email is sent in development).
3. Open it and press **Sign in**. Links expire after 15 minutes and work once; sessions last 7 days.

How it works: the API sets an httpOnly, SameSite=Lax cookie (`ll_session`). `localhost:3000` and
`localhost:4100` are the same site (ports don't count), so the browser sends it to both. Only a SHA-256
hash of each token is stored. Every API route is denied unless it is marked `@Public()` or lists its roles
with `@Roles(...)`; the role is read from the database on every request.

**Production note:** the web and API services must share a parent domain (e.g. `app.example.com` and
`api.example.com`) for the cookie to work, and the API must run behind HTTPS (`Secure` cookie).

## Maintenance requests (tenants)

Sign in as `tenant@leaselens.test` → **My requests** → **New request**. Photos (up to 3, JPG/PNG/WebP,
5 MB each) are checked by their content in the browser and again by the API, turned upright, stripped of
metadata (GPS, device) and saved under `uploads/work-orders/` (gitignored; override with `UPLOADS_DIR`).
Only the file key is stored in the database, and the API serves a photo only to the tenant who created the
request or to coordinators/managers. The unit always comes from the signed-in tenant's database record.

## AI triage (Gemini)

After a tenant submits, the API answers right away ("Received") and triages in the background:

1. **Emergency rules first (no AI)** — gas smell, fire/smoke, water through the ceiling, flooding, sparks or
   burning smell, no heat during the heating season, a vulnerable person locked out. A match sets EMERGENCY,
   shows the tenant emergency instructions and alerts on-call (`notifications` table + API log).
2. **Gemini** gets only the scrubbed description, the cleaned photos, the unit type and any multiple-choice
   answers — never names, emails, phone numbers, access notes, unit number or building. Tenant text sits
   between random-id BEGIN/END markers and the model is told it is data, never instructions.
3. The JSON reply is checked with the shared Zod schema. Invalid, an error, or no answer within 25 s →
   `NEEDS_REVIEW`. Rules run again on the AI's text; the AI can raise urgency but never lower an emergency.
4. Missing info → up to 2 approved questions on the tenant's request page; answers re-run triage once.
5. Every run is saved in `triage_results` and `audit_log` (raw output, model, prompt version).

**Settings** (`apps/api/.env`):

| Variable | Development default | What it does |
|---|---|---|
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | Model tried first |
| `GEMINI_FALLBACK_MODEL` | `gemini-3.8-flash` | Used when the first model is rate-limited (429) or overloaded (503) |
| `TRIAGE_TIMEOUT_MS` | `25000` | Wait this long for the AI before marking the request `NEEDS_REVIEW` (1000–120000) |

The lighter model is first in development because `gemini-3.8-flash` was rate-limited, overloaded or timed
out in 4 of 5 calls on 2026-10-02. Swap them in `.env` if that changes.

**Your dev server calls Gemini for real** whenever a tenant submits or answers, and at startup for requests
that have been waiting more than a minute (set `TRIAGE_SWEEP="off"` to disable that). To triage one request
by hand: `npm run triage:once -w @leaselens/api -- <workOrderId> --rerun`.

## Staff queue and vendor dispatch

- **Coordinators and managers** (`coordinator@` / `manager@leaselens.test`) land on `/staff`: open requests,
  emergencies first, then urgent, then not-yet-triaged, then routine — oldest first in each group. Filter by
  urgency and status. A request page shows photos, the tenant's answers, the AI's summary for the vendor, the
  matched emergency rule, the full triage history (AI runs and human changes) and any dispatch.
- **Override**: change category or urgency with a reason. Saved as a new triage history entry and in the audit
  log; the coordinator is always taken from the session. Lowering an emergency needs a longer reason, a
  confirmation tick, and alerts on-call.
- **Dispatch**: the top 3 vendors with the right trade are suggested with a reason and an estimated cost
  (hourly rate × typical hours for the trade); **Approve** creates the dispatch. Routine, confidently triaged
  jobs estimated below `AUTO_DISPATCH_LIMIT_USD` are sent automatically right after AI triage — shown as
  "Sent automatically" / "auto" and logged as `dispatch.auto` (skips are logged as `dispatch.auto.skipped`).
- **Vendors** (`vendor@leaselens.test`, Capital Flow Plumbing) land on `/vendor/jobs` and see only their own
  jobs: summary, photos, unit and address, permission to enter, access notes. **Mark complete** takes a note
  and an optional photo (same checks as tenant photos); the tenant then sees "Completed".
- Dispatches and completions write a row to `notifications` and log it in the API terminal.

## Troubleshooting

- **"Too many requests" when signing in** — request-link allows 5 requests per IP per 15 minutes
  (and 3 links per email). Restart the API to reset the counters in development.

- **`db:migrate` asks for a migration name with no schema change** — someone added an index Prisma can't
  describe (e.g. HNSW on `embeddings.vector`). Prisma 6 sees it as drift. Keep vector indexes out until we
  add them with a migration plus a documented workaround.
- **`db:migrate` hangs on "advisory lock"** — a previous `prisma migrate` is still running. Close it and retry.

- **Why the API uses port 4100** — NoMachine (`nxd`) listens on port 4000 by default, and on Windows
  both programs can bind it, so API requests get empty replies. To use another port, set `PORT` and
  `API_URL` in `apps/api/.env` and `NEXT_PUBLIC_API_URL` in `apps/web/.env.local`.
  Check what holds a port with `netstat -ano | findstr :4100`.
