# LeaseLens — instructions for AI coding agents

Read `docs/SPEC.md` before any task. It is the source of truth for features, data model and rules.

## Project
- npm workspaces monorepo: `apps/web` (Next.js + Tailwind + shadcn/ui), `apps/api` (NestJS + Prisma),
  `packages/shared` (Zod schemas + types used by both).
- Database: Neon PostgreSQL with pgvector. Connection string in `DATABASE_URL`.
- AI: Gemini via `@google/genai`; model from `GEMINI_MODEL`; key in `GEMINI_API_KEY`.
- Developer OS is Windows. Prefer cross-platform npm scripts (no bash-only commands).

## Safety rules (never break these)
1. Emergency rules run BEFORE and AFTER the AI call. The AI can raise urgency, never lower an emergency.
2. Never send tenant names, emails, phone numbers or demographics to any AI model.
3. The server sets who approved / who acted from the session. Ignore any actor or approver field from the client.
4. Role checks happen on the server for every endpoint (guards), not only in the UI.
5. Every AI response is validated with a Zod schema. Invalid → mark NEEDS_REVIEW, never crash.
6. Lease answers must cite lease + page or say "Not found in the lease."
7. Store model, prompt version, raw output and any human override in the audit log.
8. Never commit secrets, `.env`, or `uploads/`. Only `.env.example` is tracked.

## How to work
- Plan first for anything touching more than 3 files; show me the plan before editing.
- Write or update tests with each feature. Run them and fix failures before saying a task is done.
- Every UI action needs loading, error and empty states. Tenant pages must work at 390px wide.
- After each feature: run the app, check it in the browser, and summarize what changed in plain English.
- Keep a short entry per session in `docs/DEVLOG.md`: date, prompt used, what was built, problems and fixes, time spent.

## Commands (update as they are created)
- `npm install` — install all workspaces
- `npm run dev` — run web (http://localhost:3000) and api (http://localhost:4100) together
- `npm run db:migrate` — Prisma migrate dev (uses DIRECT_URL); `npm run db:seed` — wipe + load fictional sample data
- `npm run db:studio` — Prisma Studio on http://localhost:5555
- `npm run triage:once -w @leaselens/api -- <workOrderId> [--rerun]` — one REAL Gemini triage call, prints what was sent/received
- `npm test` — API tests; `npm run typecheck`; `npm run lint`; `npm run check` — all three
