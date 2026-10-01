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
| `npm run db:migrate` | Prisma migrate (needs `DATABASE_URL`) |
| `npm run db:seed` | Seed data (not implemented yet) |

## Troubleshooting

- **Why the API uses port 4100** — NoMachine (`nxd`) listens on port 4000 by default, and on Windows
  both programs can bind it, so API requests get empty replies. To use another port, set `PORT` and
  `API_URL` in `apps/api/.env` and `NEXT_PUBLIC_API_URL` in `apps/web/.env.local`.
  Check what holds a port with `netstat -ano | findstr :4100`.
