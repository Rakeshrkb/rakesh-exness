import { createClient } from "redis";
import type { redisPriceData } from "../constants/types";
import { priceMap } from "../data/store";
import { SUPPORTED_ASSETS } from "../constants/envConstants";
import { logger } from "../utils/logger";
import { updateTrailingStopLoss } from "./positionMonitor";

export const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6380",
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        logger.error("Max Redis retries reached");
        return new Error("Redis connection failed");
      }

      const delay = Math.min(retries * 1000, 30000);
      logger.info(`Retrying Redis in ${delay}ms`);
      return delay;
    },
  },
});

export const initPriceMonitor = async () => {
  redisClient.on("error", (err) => {
    logger.error("Redis error:", err);
  });

  // redisClient.on("ready", () => {
  //   logger.info("Redis connected");
  // });

  await redisClient.connect();

  for (const asset of SUPPORTED_ASSETS) {
    await redisClient.subscribe(asset, (redisMsg) => {
      const parsed = JSON.parse(redisMsg);
      const data: redisPriceData = {
        bid: parsed.bidPrice,
        ask: parsed.askPrice,
        decimals: parsed.decimals,
        time: parsed.time,
      };
      priceMap.set(asset, data); 
      updateTrailingStopLoss(data, asset);
      // {"bid":685818874,"ask":692711526,"decimals":4,"time":1774596646}
    });
  }
};

export const stopPriceMonitor = async () => {
  try {
    if (!redisClient.isOpen) return;

    await redisClient.disconnect();
    logger.info("Redis connection closed");

    priceMap.clear();
  } catch (err) {
    logger.error("Error stopping price monitor:", err);
  }
};
