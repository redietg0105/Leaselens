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
