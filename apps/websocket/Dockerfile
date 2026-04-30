FROM oven/bun:1

WORKDIR /app

COPY . .

RUN bun install

WORKDIR /app/apps/websocket

EXPOSE 8080

CMD ["bun", "run", "src/index.ts"]