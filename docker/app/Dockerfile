# syntax=docker/dockerfile:1.7
# SvelteKit app (adapter-node). Server deps are bundled into build/, so the final
# image is: Alpine + libstdc++ + the node binary + build output. No npm, no node_modules.
#   docker build -f docker/app/Dockerfile -t hotel-pms/app .
ARG NODE_VERSION=22
ARG ALPINE_VERSION=3.24

# ---------- 1. deps: install once, cached by lockfile ----------
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS deps
WORKDIR /src
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund --ignore-scripts

# ---------- 2. build: compile + bundle server dependencies ----------
FROM deps AS build
COPY svelte.config.js vite.config.ts tsconfig.json ./
COPY static ./static
COPY src ./src
RUN npx svelte-kit sync \
 && npm run build \
 && printf '{"type":"module"}\n' > build/package.json

# ---------- 3. node: source of the node binary only ----------
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS node

# ---------- 4. runtime ----------
FROM alpine:${ALPINE_VERSION} AS runtime
RUN apk add --no-cache libstdc++ \
 && addgroup -S -g 1000 node \
 && adduser -S -u 1000 -G node -H -s /sbin/nologin node
COPY --from=node /usr/local/bin/node /usr/local/bin/node
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /src/build ./
USER node
EXPOSE 3000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/healthz >/dev/null || exit 1
CMD ["node", "index.js"]
