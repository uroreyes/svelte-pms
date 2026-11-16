# syntax=docker/dockerfile:1.7
# One-shot DB tooling: migrations, ID-document re-encryption, demo seed (only with SEED_DEMO=true), night audit, bootstrap.
# Scripts are pre-bundled with esbuild → no drizzle-kit/tsx/node_modules at runtime.
#   docker build -f docker/migrate/Dockerfile -t hotel-pms/migrate .
#   docker run --rm -e DATABASE_URL=… -e PII_ENCRYPTION_KEY=… hotel-pms/migrate   # migrate + re-encrypt (+ demo seed when SEED_DEMO=true)
#   docker run --rm -e DATABASE_URL=… -e PII_ENCRYPTION_KEY=… hotel-pms/migrate node bootstrap.mjs --property-name <name> --slug <slug> --admin-email <email>
#   docker run --rm -e DATABASE_URL=… -e PII_ENCRYPTION_KEY=… hotel-pms/migrate node night-audit.mjs
#   docker run --rm -e DATABASE_URL=… -e PII_ENCRYPTION_KEY=… -e PII_ENCRYPTION_PREVIOUS_KEYS=… hotel-pms/migrate node reencrypt-id-documents.mjs
#   docker run --rm -e DATABASE_URL=… hotel-pms/migrate node reset-operational-data.mjs --property <slug> --operator <email> [--confirm <slug>] [--force]
#     (go-live only; destructive — dry run without --confirm; stop the app first; see README "Operational data reset")
#   docker run --rm -e DATABASE_URL=… -e PII_ENCRYPTION_KEY=… hotel-pms/migrate node seed-demo.mjs --property <slug> [--operator <email>] [--count <1-50>]
#   docker run --rm … hotel-pms/migrate node seed.mjs --no-demo   (setup without demo bookings)
# Without Docker: bash scripts/ops/*.sh (README "Servers without Docker").
# reencrypt-id-documents exit codes: 0 ok · 1 fatal (bad/missing key, DB error → chain stops)
#   · 2 some rows failed to decrypt (logged by guest id; startup continues, fix keyring and re-run).
# reset-operational-data exit codes: 0 dry run printed or reset committed · 1 refused/fatal (nothing changed).
# bootstrap exit codes: 0 created · 1 refused/invalid/fatal (nothing created).
ARG NODE_VERSION=22
ARG ALPINE_VERSION=3.24

# ---------- 1. deps ----------
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS deps
WORKDIR /src
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund --ignore-scripts

# ---------- 2. build: bundle scripts (resolves $lib via svelte-kit tsconfig paths) ----------
FROM deps AS build
COPY svelte.config.js tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN npx svelte-kit sync && npm run build:tools

# ---------- 3. node binary ----------
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS node

# ---------- 4. runtime ----------
FROM alpine:${ALPINE_VERSION} AS runtime
RUN apk add --no-cache libstdc++ \
 && addgroup -S -g 1000 node \
 && adduser -S -u 1000 -G node -H -s /sbin/nologin node
COPY --from=node /usr/local/bin/node /usr/local/bin/node
ENV NODE_ENV=production \
    MIGRATIONS_DIR=/app/drizzle
WORKDIR /app
COPY --from=build --chown=node:node /src/dist-tools ./
COPY --chown=node:node drizzle ./drizzle
USER node
CMD ["sh", "-c", "node migrate.mjs && (node reencrypt-id-documents.mjs || [ $? -eq 2 ]) && if [ \"$SEED_DEMO\" = \"true\" ]; then node seed.mjs; fi"]
