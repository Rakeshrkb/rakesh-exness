import { createClient } from "redis";
import { SUPPORTED_ASSETS, type Asset } from "./constant";
import { SUBSCRIPTION_MANAGER } from "./subscriptionManager";
import { WebSocket } from "ws";
import { USER_WS_MAP } from "./subscriptionManager";
import { REDIS_URL } from "./constant";
const redisClient = createClient({
  url: REDIS_URL,
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

export default redisClient;
const orderSubscriber = redisClient.duplicate();
const priceSubscriber = redisClient.duplicate();

export const startRedis = async () => {
  try {
    await redisClient.connect();
  } catch (error) {
    console.error("❌ Failed to connect to Redis:", error);
    process.exit(1);
  }
};

export const stopRedis = async () => {
  try {
    if (redisClient.isOpen) {
      await redisClient.quit();
      console.log("🔌 Disconnected from Redis");
    } else {
      console.log("⚠️ Redis client is already disconnected");
    }
  } catch (error) {
    console.error("❌ Failed to disconnect from Redis:", error);
  }
};

export const initRedisSubscriptions = async () => {
  await startRedis();
  if (!priceSubscriber.isOpen) {
    await priceSubscriber.connect();
  }
  await initRedisUserOrders();
  if (!priceSubscriber.isOpen) {
    return;
  }
  SUPPORTED_ASSETS.forEach((asset) => {
    priceSubscriber.subscribe(asset, (message) => {
      SUBSCRIPTION_MANAGER.get(asset)?.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      });
    });
  });
};

export const initRedisUserOrders = async () => {
  const userOrdersChannel = "order:*";
  if (!orderSubscriber.isOpen) {
    await orderSubscriber.connect();
  }
  orderSubscriber.pSubscribe(userOrdersChannel, (message, channel) => {
    const parsed = JSON.parse(message);
    const userId = parsed.data.userId;
    console.log(`[INFO] Received order update for user ${userId}:`, message);
    if (!userId) return;
    USER_WS_MAP.get(userId!)?.forEach((ws) => {
      console.log(`[INFO] Sending order update to user ${userId} WebSocket:`, message);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  });
};

export const unSubscribeRedisChannelsAndClose = async () => {
  try {
    if (priceSubscriber.isOpen) {
      for (const asset of SUPPORTED_ASSETS) {
        await priceSubscriber.unsubscribe(asset);
      }
    }
    if (priceSubscriber.isOpen) {
      await priceSubscriber.quit();
    }
    await orderSubscriber.pUnsubscribe("user_orders:*");

    if (orderSubscriber.isOpen) {
      await orderSubscriber.quit();
    }

    if (redisClient.isOpen) {
      await redisClient.quit();
    }
  } catch (error) {
    console.error("❌ Failed to unsubscribe from Redis channels:", error);
  }
};
