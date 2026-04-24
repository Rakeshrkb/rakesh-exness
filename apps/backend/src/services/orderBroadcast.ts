import { createClient } from "redis";
import type { Order } from "../constants/types";
import { logger } from "../utils/logger";
import { centsToUsd, fromInternalPrice } from "../utils/constantUtils";

// used for publishing 
const redisPublisher = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6380",
});


export const initRedisPublisher = async () => {
  try {
    if(!redisPublisher.isOpen) {
    await redisPublisher.connect();
   }
  } catch (error) {
    logger.error("Error connecting Redis Publisher:", error);
  }
};

export const stopRedisPublisher = async () => {
  try {
    await redisPublisher.quit();
    logger.info("Redis Publisher disconnected successfully");
  } catch (error) {
    logger.error("Error disconnecting Redis Publisher:", error);
  }
};

export const broadCastOrderOpened = async (orderData: Order) => {
  try {
    if (!orderData) {
      throw new Error("Invalid order data");
    }
    const neworder: Order = {
      ...orderData,
      margin: centsToUsd(orderData.margin),
      openPrice: fromInternalPrice(orderData.openPrice),
    };
    const OrderObj = {
      type: "ORDER_OPENED",
      data: neworder,
    };
    const redisKey = `order:${orderData.orderId}`;
    await redisPublisher.publish(redisKey, JSON.stringify(OrderObj));
    logger.info("Successfully published order From Redis to websocket", redisKey);
  } catch (error) {
    logger.error("Error publishing order:", error);
  }
};

export const broadCastOrderClosed = async (orderData: Order, pnl: number) => {
  try {
    if (!orderData) {
      throw new Error("Invalid order data");
    }
    const closedOrderData = {
      ...orderData,
      margin: centsToUsd(orderData.margin),
      openPrice: fromInternalPrice(orderData.openPrice),
      pnl: centsToUsd(pnl),
    };
    const OrderObj = {
      type: "ORDER_CLOSED",
      data: closedOrderData,
    };
    const redisKey = `order:${orderData.orderId}`;
    await redisPublisher.publish(redisKey, JSON.stringify(OrderObj));
    logger.info("Successfully published closed order From Redis to websocket", redisKey);
  } catch (error) {
    logger.error("Error publishing closed order:", error);
  }
};
