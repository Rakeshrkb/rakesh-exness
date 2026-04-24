import { createClient } from "redis";

const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6380",
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.error("Max Redis retries reached");
        return new Error("Redis connection failed");
      }
      const delay = Math.min(retries * 1000, 30000);
      console.info(`Retrying Redis in ${delay}ms`);
      return delay;
    },
  },
});

const orderPublisher = redisClient.duplicate();

export const startRedis = async () => {
  try {
    await orderPublisher.connect();
  } catch (error) {
    console.error("❌ Failed to connect to Redis:", error);
    process.exit(1);
  }
};

export const stopRedis = async () => {
  try {
    if (orderPublisher.isOpen) {
      await orderPublisher.quit();
    } else {
      console.log("⚠️ Redis client is already disconnected");
    }
  } catch (error) {
    console.error("❌ Failed to disconnect from Redis:", error);
  }
};


export const sendOrderUpdateToWSS = async (channel: string, message: string) => {
    if (!orderPublisher.isOpen) {
        console.warn("⚠️ Redis client is not connected. Cannot publish message.");
        return;
    }
    try {
        const userOrdersChannel = "user_orders:";
        await orderPublisher.publish(userOrdersChannel + channel , message);
    } catch (error) {
        console.error("❌ Failed to publish message to Redis:", error);
    }
};