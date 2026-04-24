import { prisma } from "database";
import type { Order } from "../constants/types";
import { logger } from "../utils/logger";

// Cache for platform profit (updated in real-time)
let cachedPlatformProfit = {
  totalProfit: 0, // In cents
  openTrades: 0,
  closedTrades: 0,
  totalTrades: 0,
  lastUpdated: Date.now(),
};

export const initPlatformProfit = async () => {
  try {
    const orders = await prisma.platformProfit.findMany({});
    let totalProfit = 0;
    let openTrades = 0;
    let closedTrades = 0;
    let totalTrades = 0;
    let lastUpdated = Date.now();

    for (const order of orders) {
      totalProfit += order.totalProfit;
      openTrades += order.openTrades;
      closedTrades += order.closedTrades;
      totalTrades += order.totalTrades;
      if (order.lastUpdated.getTime() > lastUpdated) {
        lastUpdated = order.lastUpdated.getTime();
      }
    }

    cachedPlatformProfit = {
      totalProfit,
      openTrades,
      closedTrades,
      totalTrades: openTrades + closedTrades,
      lastUpdated: Date.now(),
    };

    logger.info("Platform profit initialized:", cachedPlatformProfit);
  } catch (error) {
    logger.error("Error initializing platform profit:", error);
  }
};

export const onOrderOpened = async (order: Order) => {
  try {
    const fees = Math.floor(order.margin * 0.005); // 0.05% fee on margin
    cachedPlatformProfit.totalProfit += fees;
    cachedPlatformProfit.openTrades += 1;
    cachedPlatformProfit.totalTrades += 1;
    cachedPlatformProfit.lastUpdated = Date.now();
  } catch (error) {
    logger.error("Error updating platform profit on order opened:", error);
  }
};