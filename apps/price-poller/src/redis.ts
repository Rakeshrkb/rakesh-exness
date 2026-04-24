import { createClient } from "redis";
import { binanceEmitter } from "./binance";
import type { Trades, typeOfRedishPriceData } from "./types";

export const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6380",
});

let tradeListener: ((tradeData: Trades) => Promise<void>) | null = null;

export const startRedis = async () => {
  try {
    await redisClient.connect();
    tradeListener = async (tradeData: Trades) => {
      try {
        const midPrice = tradeData.price;
        const spreadAmount = Math.floor(midPrice * 0.005);
        const redisPriceData: typeOfRedishPriceData = {
          symbol: tradeData.symbol.replace("USDT", ""),
          askPrice: midPrice + spreadAmount,
          bidPrice: midPrice - spreadAmount,
          decimals: 4,
          time: Math.floor(tradeData.timestamp / 1000),
        };
        const channel = tradeData.symbol.replace("USDT", "");
        await redisClient.publish(channel, JSON.stringify(redisPriceData));
      } catch (error) {
        console.error("❌ Failed to store trade in Redis:", error);
      }
    };
    binanceEmitter.on("trade", tradeListener);
  } catch (error) {
    console.error("❌ Failed to connect to Redis:", error);
    process.exit(1);
  }
};

export const disconnectRedis = async () => {
  try {
    await redisClient.quit();
    console.log("🔌 Disconnected from Redis");
  } catch (error) {
    console.error("❌ Failed to disconnect from Redis:", error);
  }
};
