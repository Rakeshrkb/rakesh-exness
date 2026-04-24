const originalStderrWrite = process.stderr.write.bind(process.stderr);
let suppressNextStderrLines = 0;

process.stderr.write = function (chunk: any, ...args: any[]): boolean {
  const text = chunk.toString();

  // Check if this line contains the KafkaJS warning
  if (
    text.includes('TimeoutNegativeWarning') ||
    text.includes('is a negative number') ||
    text.includes('Timeout duration was set to 1')
  ) {
    // Start suppressing this line and the next 10 lines (the stack trace)
    suppressNextStderrLines = 11;
    return true; // Pretend we wrote it successfully
  }

  // Check if this line is part of the KafkaJS stack trace
  if (
    suppressNextStderrLines > 0 &&
    (text.trim().startsWith('at ') ||
     text.includes('kafkajs') ||
     text.includes('requestQueue') ||
     text.includes('node:') ||
     text.trim() === '')
  ) {
    suppressNextStderrLines--;
    return true; // Suppress this line
  }

  // Not a KafkaJS warning line - reset counter and write normally
  if (suppressNextStderrLines > 0 && !text.trim().startsWith('at ')) {
    // This line doesn't look like part of the stack trace, reset
    suppressNextStderrLines = 0;
  }

  // Pass through all other output
  return originalStderrWrite(chunk, ...args);
};

// Also intercept console.warn as backup
const originalWarn = console.warn;
console.warn = function (...args: any[]) {
  const message = args.join(' ');

  if (
    message.includes('TimeoutNegativeWarning') ||
    message.includes('is a negative number') ||
    message.includes('Timeout duration was set to 1') ||
    message.includes('There is no leader for this topic-partition as we are in the middle of a leadership election')
  ) {
    return; // Suppress
  }

  originalWarn.apply(console, args);
};

import { startBinancePricePoller, stopBinancePricePoller } from "./binance";
import { startRedis, disconnectRedis } from "./redis";
import { startKafkaProducer, stopKafkaProducer } from "./kafka-producer";
import { startKafkaConsumer, stopKafkaConsumer } from "./kafka-consumer";

const startApp = async () => {
  console.log("═══════════════════════════════════════");
  console.log("  Starting Price_Poller Service");
  console.log("═══════════════════════════════════════");

  await startRedis();
  console.log("[1/4]  ✓ Redis client connected");

  await startKafkaProducer();
  console.log("[2/4]  ✓ Kafka Producer started");

  await startKafkaConsumer();
  console.log("[3/4]  ✓ Kafka Consumer started");

  startBinancePricePoller();
  console.log("[4/4]  ✓ Binance Price Poller started");
};

startApp();

process.on("SIGINT", async () => {
  console.log("Shutting down server gracefully...");
  stopBinancePricePoller(); // stop WebSocket connection and remove listeners from binanceEmitter
  console.log("[1/4]  X Binance Price Poller stopped");
  await disconnectRedis();  // disconnect Redis client
  console.log("[2/4]  X Redis client disconnected");
  await stopKafkaProducer();  // stop Kafka producer
  console.log("[3/4]  X Kafka Producer stopped");
  await stopKafkaConsumer();  // stop Kafka consumer
  console.log("[4/4]  X Kafka Consumer stopped");
  process.exit(0);
});
