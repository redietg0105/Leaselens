# LeaseLens API (NestJS + Prisma) for Cloud Run. Build from the repository root:
#   docker build -f apps/api/Dockerfile .
# Node 24 on Debian bookworm (OpenSSL 3) — Prisma's engine for this image is debian-openssl-3.0.x.

FROM node:24-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Workspace manifests only, so the dependency layer is cached until package files change.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

FROM base AS build
RUN npm ci -w @leaselens/api -w @leaselens/shared --include-workspace-root=false --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @leaselens/shared \
  && cd apps/api && npx prisma generate && npx nest build

FROM base AS runtime
ENV NODE_ENV=production
# Production dependencies only (no tsx, so the seed script can't run here; it also refuses production).
RUN npm ci -w @leaselens/api -w @leaselens/shared --include-workspace-root=false --omit=dev --no-audit --no-fund \
  && npm cache clean --force
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/prisma apps/api/prisma
RUN cd apps/api && npx prisma generate
WORKDIR /app/apps/api
USER node
# Cloud Run sets PORT (8080); main.ts listens on it.
EXPOSE 8080
CMD ["node", "dist/main.js"]
