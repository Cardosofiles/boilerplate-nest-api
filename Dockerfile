# syntax=docker/dockerfile:1

# =============================================================================
# Base — Node + pnpm (via corepack). Shared parent for every build-time stage.
# The native build toolchain lives here so any future native addon (bcrypt,
# argon2, …) compiles; it is NEVER copied into the final runtime image.
# =============================================================================
FROM node:22-bookworm-slim AS base

# pnpm store location, used by the BuildKit cache mounts below.
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /usr/src/app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.14.0 --activate

# =============================================================================
# Development — full dependencies + hot reload. Used by docker-compose.
# =============================================================================
FROM base AS development
ENV NODE_ENV=development

COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .

EXPOSE 3333
CMD ["pnpm", "run", "start:dev"]

# =============================================================================
# Build — compile TypeScript into ./dist (needs devDependencies).
# =============================================================================
FROM base AS build
ENV NODE_ENV=development

COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

# =============================================================================
# Production dependencies — prod-only node_modules (no devDependencies).
# =============================================================================
FROM base AS prod-deps
ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod

# =============================================================================
# Production — minimal runtime. No pnpm, no toolchain, non-root, tini as PID 1.
# Ships only: prod node_modules + dist + package.json.
# =============================================================================
FROM node:22-bookworm-slim AS production
ENV NODE_ENV=production
ENV PORT=3333
WORKDIR /usr/src/app

# tini → correct PID 1: forwards signals and reaps zombies (graceful shutdown).
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/*

# Dedicated unprivileged user.
RUN useradd --system --user-group --create-home --home-dir /home/nonroot nonroot

# Copy only the runtime artifacts, already owned by the unprivileged user.
COPY --from=prod-deps --chown=nonroot:nonroot /usr/src/app/node_modules ./node_modules
COPY --from=build     --chown=nonroot:nonroot /usr/src/app/dist         ./dist
COPY --from=build     --chown=nonroot:nonroot /usr/src/app/package.json ./package.json

USER nonroot

EXPOSE 3333

# Liveness probe via Node's built-in global fetch — no curl/wget in the image.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3333/health/liveness').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# tini handles signals; the app shuts down gracefully on SIGTERM.
ENTRYPOINT ["/usr/bin/tini", "-g", "--"]
CMD ["node", "dist/main.js"]
