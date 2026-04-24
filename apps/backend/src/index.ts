import express from "express";
import cors from "cors";
import { PORT } from "./constants/envConstants";
import { ErrorHandler, notFoundHandler } from "./utils/errorHandler";
import { initPriceMonitor, stopPriceMonitor } from "./services/priceMonitor";
import { startMatchingEngineProducer, stopMatchingEngineProducer } from "./kafka/kafkaproducer";
import { initRedisPublisher, stopRedisPublisher } from "./services/orderBroadcast";
import { startStateRestoration } from "./services/stateRestoration";
import { startLiquidationChecker, startUpdateTSLtoDb } from "./services/positionMonitor";
import { logger } from "./utils/logger";
import mainRouter from "./routes/index";
import { sendMessageToKafka } from "./controllers/spot.controller";

const app = express();
const port = Number(PORT) || 4000;

app.use(express.json());
app.use(cors());
app.use("/api/", mainRouter);
app.get("/", (req, res) => {
  res.status(200).json({
    message: "Server is running 🚀",
  });
});
app.use(notFoundHandler);
app.use(ErrorHandler);
let server: any;
let shuttingDown = false;
async function startServer() {
  try {
    server = app.listen(port, () => {
        console.log("═══════════════════════════════════════");
        console.log(`\x1b[32m🚀 Server running on port ${port}\x1b[0m`);
        console.log("═══════════════════════════════════════");
    });
    try{
      await startStateRestoration();
    } catch(error){
      logger.error("Error during state restoration:", error);
      throw error; // rethrow to be caught by outer catch
    }
    logger.info("[1/6] State restoration completed");
    await initPriceMonitor();
    logger.info("[2/6] Price Monitor initialized");
    await initRedisPublisher();
    logger.info("[3/6] Redis Publisher initialized");
    startLiquidationChecker();
    logger.info("[4/6] Liquidation Checker initialized");
    startUpdateTSLtoDb();
    logger.info("[5/6] TSL to DB updater initialized");
    await startMatchingEngineProducer();
    logger.info("[6/6] Kafka Producer started");
    setInterval(() => {
  const sampleMessage = {
    userId: "e9133975-7255-54ae-9525-2e4584b15d16",
    orderId: `order-${Math.floor(Math.random() * 1000)}`,
    symbol: "BTCUSD",
    price: (50000 + Math.random() * 10000).toFixed(2),
    quantity: (Math.random() * 5).toFixed(4),
    side: Math.random() > 0.5 ? "buy" : "sell",
    timestamp: new Date().toISOString(),
  };
  sendMessageToKafka(sampleMessage);
}, 20000);
  } catch (error) {
    logger.error("error while starting server");
    process.exit(1);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
startServer();

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info(`\n${signal} received. Shutting down gracefully...`);

  // Force exit after 2 seconds if cleanup hangs
  const forceExit = setTimeout(() => {
    logger.error("Cleanup took too long, forcing exit.");
    process.exit(1);
  }, 2000);

  try {
    await stopPriceMonitor();
    logger.info("[1/3] Price Monitor stopped");

    await stopRedisPublisher();
    logger.info("[2/3] Redis Publisher stopped");

    if (server) {
      logger.info("Closing HTTP server...");

      // 1. Terminate all active connections immediately
      if (typeof server.closeAllConnections === "function") {
        server.closeAllConnections();
      }

      // 2. Start the closing process
      server.close();

      // 3. Instead of awaiting a potentially hanging callback,
      // we assume the server is "closing" and move to the next step.
      console.log("[3/3] HTTP server signaled to close");
    }

    // Clear the global safety timeout
    clearTimeout(forceExit);
    console.log("Cleanup complete. Goodbye!");

    // Exit the process
    process.exit(0);
  } catch (err) {
    console.error("Shutdown error:", err);
    process.exit(1);
  }
}
