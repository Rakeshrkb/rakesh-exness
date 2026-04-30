const originalSetTimeout = globalThis.setTimeout;
// @ts-ignore
globalThis.setTimeout = (handler: TimerHandler, timeout?: number, ...args: any[]) => {
  return originalSetTimeout(handler, Math.max(0, timeout || 0), ...args);
};

import { Kafka, logLevel } from "kafkajs";
import type { Trades, typeOfPriceData } from "./types";
import { binanceEmitter } from "./binance";
import { brokerUrl } from "./constants";

// connecting with docker and configuration for retry mechanism
export const kafkaInstance = new Kafka({
  clientId: "rakesh_exness_price_poller_producer",
  brokers: [brokerUrl],
  logLevel: logLevel.WARN,
  connectionTimeout: 10000,
  requestTimeout: 30000,
  retry: {
    initialRetryTime: 300,
    retries: 10,
    maxRetryTime: 30000,
    multiplier: 2,
    restartOnFailure: async (e: any) => {
      return e.retriable === true;
    },
  },
});

// create a producer instance
const producer = kafkaInstance.producer({
  allowAutoTopicCreation: true,
  transactionTimeout: 30000,
  retry: {
    initialRetryTime: 300,
    retries: 10,
  },
});

let tradeListener: ((tradeData: Trades) => Promise<void>) | null = null;

export const startKafkaProducer = async () => {
  try {
    await producer.connect();

    tradeListener = async (tradeData: Trades) => {
      try {
        const publishTrade: typeOfPriceData = {
          symbol: tradeData.symbol,
          price: tradeData.price,
          tradeId: tradeData.tradeId,
          timestamp: tradeData.timestamp,
          quantity: tradeData.quantity,
        };

        await producer.send({
          topic: "trades",
          messages: [
            {
              key: tradeData.symbol,
              value: JSON.stringify(publishTrade),
              timestamp: String(Date.now()),
            },
          ],
        });
      } catch (error) {
        console.error("❌ Failed to connect Kafka Producer:", error);
      }
    };
    binanceEmitter.on("trade", tradeListener);
  } catch (error) {
    console.error("❌ Failed to publish trade to Kafka:", error);
  }
};


export const stopKafkaProducer = async () => {
  try {
    if (tradeListener) {
      binanceEmitter.off("trade", tradeListener);
      tradeListener = null;
    }
    await producer.disconnect();
    console.log("✓ Kafka Producer disconnected");
  } catch (error) {
    console.error("❌ Failed to disconnect Kafka Producer:", error);
  }
};