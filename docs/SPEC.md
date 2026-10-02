# LeaseLens — Product & Technical Spec (local MVP)

Source: Workshop 5.2 use case. This file is the single source of truth for AI coding agents.
App #1 was ShiftSense (Healthcare, nurse staffing). LeaseLens is App #2 (Startup / PropTech).

## 1. Company and business problem

LeaseLens is an early-stage PropTech startup. Pilot customer: Capitol Residential Partners (fictional),
~2,000 apartments across 18 buildings in the Washington, DC area.

- Maintenance requests arrive vague ("it's leaking"). Coordinators call tenants back, the wrong trade
  is sent, and emergencies sit in the same queue as routine fixes.
- Renewal options, notice periods and rent increases are buried in lease PDFs, so deadlines get missed.

## 2. Target users and roles

| Role (DB enum) | Uses | Can do |
|---|---|---|
| TENANT | tenant portal | Submit requests for own unit, answer follow-ups, see own requests |
| VENDOR | tenant portal (job page) | See only assigned jobs, mark complete with notes |
| COORDINATOR | staff app | Triage queue, override AI, approve vendor dispatch |
| LEASING | staff app | Upload leases, verify extracted terms, ask lease questions |
| MANAGER | staff app | Everything staff can do + dashboard |

## 3. AI solution

1. **Smart intake + triage**: Gemini reads the tenant's photo(s) + description and returns validated JSON:
   `category` (PLUMBING, ELECTRICAL, HVAC, APPLIANCE, PEST, STRUCTURAL, LOCKS_ACCESS, OTHER),
   `subIssue` (short text), `urgency` (EMERGENCY, URGENT, ROUTINE), `confidence` (0–1),
   `missingInfo` (string[]), `followUpQuestionIds` (max 2, from an approved question bank),
   `summaryForVendor` (≤ 60 words).
2. **Emergency rules (no AI)**: keyword/category rules for gas smell, smoke/fire, flooding/active leak
   through ceiling, no heat when outside temp is cold, sparking/burning smell, lockout of a vulnerable person.
   Run BEFORE the model and again on the model output. A match sets urgency=EMERGENCY, shows emergency
   instructions (call 911 / gas utility for danger) and creates an on-call notification.
3. **Vendor matching**: score = trade match (required) + availability + past first-time-fix rate − cost.
   Show top 3 with reasons; coordinator approves. Routine jobs under `AUTO_DISPATCH_LIMIT_USD` may auto-dispatch.
4. **Recurring-issue detection**: embed each request (gemini-embedding-001, 768 dims, pgvector);
   flag ≥ 3 similar requests in the same building or stack within 90 days.
5. **Lease abstraction**: upload PDF → Gemini reads the PDF directly → JSON of lease terms, each with
   `value`, `page`, `quote`, `confidence`. Leasing staff verify each field. Only VERIFIED terms create alerts.
   Fields: tenantNames, unit, startDate, endDate, monthlyRent, securityDeposit, rentEscalation,
   renewalOption, renewalNoticeDays, earlyTermination, petPolicy, parking, utilitiesIncluded,
   insuranceRequired, lateFee, subletting, maintenanceResponsibilities.
6. **Lease Q&A**: answer questions across verified leases; every answer must cite lease + page,
   or answer "Not found in the lease."
7. **Alerts**: verified dates create alerts at 90, 60 and 30 days before notice deadlines / escalations.
8. **Manager dashboard**: open work by urgency, median time-to-triage, emergencies escalated, repeat issues,
   upcoming lease dates.

## 4. Responsible AI rules (non-negotiable)

- AI recommends, people decide. Every dispatch above the limit and every lease term needs human approval.
- Never send tenant names, emails, phones or demographics to the model — only issue text, photos, unit type.
- Store model name + prompt version + raw AI output + any human override for every AI decision (audit_log).
- Lease answers without a citation are rejected.

## 5. Tech stack (local MVP)

- **Monorepo**: npm workspaces — `apps/web`, `apps/api`, `packages/shared`.
- **Frontend**: Next.js (App Router, TypeScript), Tailwind CSS, shadcn/ui. One app with two areas:
  `/tenant/*` (mobile-first) and `/staff/*` (desktop dashboard). Split into two Cloud Run services at deploy.
- **Backend**: NestJS (TypeScript), Prisma ORM, Zod (schemas shared from `packages/shared`).
- **Database**: Neon serverless PostgreSQL with the `vector` extension (pgvector).
- **AI**: Gemini API via `@google/genai` with `GEMINI_API_KEY` from Google AI Studio.
  Model from env `GEMINI_MODEL` with fallback `GEMINI_FALLBACK_MODEL` if rate-limited (429) or overloaded (503).
  Development defaults: `gemini-3.5-flash-lite` first, `gemini-3.8-flash` as fallback (3.8-flash was often
  overloaded in testing). Triage: prompt version `triage-v1`, timeout `TRIAGE_TIMEOUT_MS` (default 25 s), runs in the background after
  submit; tenant text is sent between random-id BEGIN/END markers and treated as data only (prompt-injection
  guard); descriptions are scrubbed of phone numbers, emails and the tenant name; follow-up answers are
  multiple choice from the approved bank. "No heat" is an emergency during the DC heating season
  (Oct 1 – May 1, configurable).
  Embeddings: `gemini-embedding-001` with outputDimensionality 768. (Production: Vertex AI + Document AI.)
- **Files**: local `uploads/` folder in dev behind a storage interface (Cloud Storage in production).
  Photos are checked by content (JPEG/PNG/WebP, ≤ 5 MB, max 3), turned upright from EXIF orientation and
  re-encoded to strip metadata (GPS, device). The database stores only the storage key; photos are served
  by the API only to users allowed to see that work order.
- **Auth**: passwordless magic link. In dev the link is printed in the API terminal (SendGrid in production).
  The link opens a web page (`/auth/verify`) where the user clicks to confirm, which calls `POST /auth/verify`;
  this stops email link scanners from using up the one-time link.
  Server issues an httpOnly session cookie; role comes from the database, never from the client.
- **Notifications**: `notifications` table + console log in dev (Twilio/SendGrid in production).
- **Local ports**: web 3000, API 4100 (`PORT`). Not 4000: NoMachine uses it on the dev machine.
- **Testing**: Jest (api), Playwright (web, including 390px phone width).

## 6. Data model (Prisma)

Property, Unit(buildingId, stack, floor, unitType), User(email, role, unitId?, vendorId?),
MagicLinkToken, Session, Vendor(trades[], serviceArea, hourlyRate, firstTimeFixRate, available),
WorkOrder(unitId, createdById, description, status, urgency, category, slaDueAt),
WorkOrderMedia(workOrderId, path, kind REQUEST|COMPLETION), FollowUpAnswer,
TriageResult(workOrderId, rawJson, category, urgency, confidence, model, promptVersion, overriddenById?, overrideReason?),
Dispatch(workOrderId, vendorId, approvedById?, autoDispatched, scheduledFor, completedAt, costUsd),
Embedding(entityType, entityId, vector(768)), Lease(unitId, status), LeaseDocument(leaseId, path, pages),
LeaseTerm(leaseId, field, value, page, quote, confidence, status SUGGESTED|VERIFIED|EDITED, verifiedById?),
Alert(leaseId, kind, dueDate, sentAt?, acknowledgedById?), Notification(channel, to, body, sentAt),
AuditLog(actorId, action, entity, entityId, before, after, at).

Seed: 4 buildings, 40 units, 1 user per role (tenant in Building A), 8 vendors across trades,
12 sample work orders, 3 sample lease PDFs (generated, fictional).

## 7. Key API endpoints

POST /auth/request-link · POST /auth/verify · POST /auth/logout · GET /me
POST /work-orders (multipart: fields + up to 3 photos) · GET /work-orders/mine · GET /work-orders/:id ·
GET /work-orders/:id/media/:mediaId · POST /work-orders/:id/answers
GET /staff/queue · POST /work-orders/:id/override · GET /work-orders/:id/vendors · POST /work-orders/:id/dispatch
GET /vendor/jobs · POST /vendor/jobs/:id/complete
POST /leases · GET /leases/:id/terms · POST /leases/:id/terms/:field/verify · POST /leases/ask
GET /alerts · GET /dashboard

## 8. Non-functional requirements (lessons from ShiftSense)

- Server sets approver/actor from the session; client-sent names are ignored.
- Generic login errors; rate-limit auth endpoints; Helmet security headers.
- Validate every request body and every AI response with Zod; invalid AI output → status NEEDS_REVIEW.
- Central error handler: JSON errors, no stack traces. Error boundary + loading and empty states in UI.
- `.env.example` only; `.env*`, `uploads/` and secrets gitignored. `PORT` from env. One lockfile.
- Mobile: tenant pages must not scroll horizontally at 390px. Accessible labels on all icon buttons.
- Structured logging (pino) with request IDs.

## 9. Success metrics (pilot targets)

Time to triage < 10 min · emergencies escalated within 5 min: 100% · repeat visits −30% ·
lease abstraction < 10 min per lease · missed lease deadlines: 0.
