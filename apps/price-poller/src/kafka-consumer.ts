import { kafkaInstance } from "./kafka-producer";
import type { Trades } from "./types";
import { writeBatch } from "./database";

// CRITICAL FIX: Configure consumer with proper timeouts to prevent negative timeout bug
const consumer = kafkaInstance.consumer({
  groupId: "exness_consumer_group",
  sessionTimeout: 60000, // Increased to 60s
  heartbeatInterval: 3000, // Explicitly set to 3s
  // IMPORTANT: These settings prevent timeout calculation errors
  maxWaitTimeInMs: 5000, // Max wait time for fetch requests
  retry: {
    initialRetryTime: 100,
    retries: 8,
  },
}); //connect kafka consumer

let batch: Trades[] = [];

async function flushBatch() {
  if (batch.length === 0) return; //no trades in batch then do nothing.
  const currentBatch = [...batch];
  batch = [];

  try {
    await writeBatch(currentBatch);
    console.log(` Flushed ${currentBatch.length} trades to database`);
  } catch (error) {
    console.error(" Database write failed:", error);
  }
}

export const startKafkaConsumer = async () => {
  try {
    await consumer.connect();

    await consumer.subscribe({ topic: "trades", fromBeginning: false });

    await consumer.run({
      eachMessage: async ({ message }) => {
        try {
          const data = JSON.parse(message.value?.toString() ?? "{}");
          batch.push(data);

          if (batch.length >= 500) {
            console.log(`Batch size reached (${batch.length}), flushing...`);
            await flushBatch();
          }
        } catch (error) {
          console.error("Error processing message:", error);
        }
      },
    });
  } catch (error) {
    console.error("Error starting Kafka Consumer:", error);
  }
};

export const stopKafkaConsumer = async () => {
  try {
    await consumer.disconnect();
  } catch (error) {
    console.error("❌ Failed to disconnect Kafka Consumer:", error);
  }
};
