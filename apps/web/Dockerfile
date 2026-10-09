# LeaseLens web app (Next.js standalone) for Cloud Run. Build from the repository root:
#   docker build -f apps/web/Dockerfile --build-arg API_ORIGIN=https://<api-service-url> .
# API_ORIGIN is fixed into the /api/* rewrite at build time (Next.js resolves rewrites when it builds).

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN npm ci -w @leaselens/web -w @leaselens/shared --include-workspace-root=false --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
# public/ is empty and not in git; make sure it exists for the copy below.
RUN mkdir -p apps/web/public
ARG API_ORIGIN
ARG NEXT_PUBLIC_API_URL=/api
ARG NEXT_PUBLIC_COMMIT_SHA=""
ENV API_ORIGIN=$API_ORIGIN \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_COMMIT_SHA=$NEXT_PUBLIC_COMMIT_SHA \
    NEXT_TELEMETRY_DISABLED=1
RUN test -n "$API_ORIGIN" || (echo "API_ORIGIN build argument is required" && exit 1)
RUN npm run build -w @leaselens/shared && npm run build -w @leaselens/web

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=8080
# The standalone server (with only the node_modules it needs), plus static assets and public files.
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
USER node
EXPOSE 8080
CMD ["node", "apps/web/server.js"]
