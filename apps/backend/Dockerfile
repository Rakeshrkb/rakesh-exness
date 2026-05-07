FROM oven/bun:1

WORKDIR /app

# Copy entire monorepo (simplest + safest for now)
COPY . .

# Install deps once (bun workspace handles it)
RUN bun install

# Move to backend
WORKDIR /app/apps/backend

EXPOSE 4000

CMD ["bun", "run", "src/index.ts"]