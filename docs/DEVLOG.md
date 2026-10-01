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
