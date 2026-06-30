# dockerfile# ==========================
# Builder Stage
# ==========================
FROM oven/bun:1.3.8 AS builder

WORKDIR /app

# Copy only manifest files first — enables layer caching.
# This must include every workspace's package.json since
# bun install resolves the whole workspace graph.
COPY package.json bun.lock ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/matching-engine/package.json ./apps/matching-engine/package.json
COPY apps/price-poller/package.json ./apps/price-poller/package.json
COPY apps/websocket/package.json ./apps/websocket/package.json
COPY packages ./packages

RUN bun install --frozen-lockfile

# Now bring in actual source
COPY . .

# ==========================
# Runtime Stage
# ==========================
FROM oven/bun:1.3.8-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

# Copy only what backend needs: root node_modules (hoisted deps),
# shared packages, and the backend app itself
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/backend ./apps/backend
COPY --from=builder /app/package.json ./package.json

WORKDIR /app/apps/backend

EXPOSE 4000

CMD ["bun", "run", "src/index.ts"]





















# FROM oven/bun:1

# WORKDIR /app

# # Copy entire monorepo (simplest + safest for now)
# COPY . .

# # Install deps once (bun workspace handles it)
# RUN bun install

# # Move to backend
# WORKDIR /app/apps/backend

# EXPOSE 4000

# CMD ["bun", "run", "src/index.ts"]