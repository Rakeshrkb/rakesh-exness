import express from "express";
import cors from "cors";
import type { Request, Response } from "express";
import { startKafkaConsumer, stopKafkaConsumer } from "./kafka";
import { startRedis, stopRedis } from "./redis";

const app = express();
app.use(cors());

app.get("/", (req: Request, res: Response) => {
  res.send("Hello, World! This is the Matching Engine.");
});

const PORT = process.env.MATCHING_ENGINE_PORT || 4001;
let isShuttingDown = false;

app.listen(PORT, () => {
  console.log("═══════════════════════════════════════");
  console.log(`\x1b[32m🚀 Matching Engine running on port ${PORT}\x1b[0m`);
  console.log("═══════════════════════════════════════");
});

await startKafkaConsumer();
console.log("[1/2] Kafka Consumer started");
await startRedis();
console.log("[2/2] Redis started");


process.on("SIGINT", async () => {
  await gracefulShutdown("SIGINT");
});

process.on("SIGTERM", async () => {
  await gracefulShutdown("SIGTERM");
});


export const gracefulShutdown = async (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`${signal} received. Shutting down gracefully...`);
  await stopKafkaConsumer();
  console.log("[1/2] Kafka Consumer stopped");
  await stopRedis();
  console.log("[2/2] Redis stopped");
  process.exit(0);
};
