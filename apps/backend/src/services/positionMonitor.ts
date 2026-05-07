import {
  lastPriceMap,
  priceMap,
  trailingStopLossOrdersMap,
  dirtyOrders,
} from "../data/store";
import {
  checkBuyLiquidations,
  checkSellLiquidations,
  closeOrder,
} from "../utils/tradeUtils";
import { SUPPORTED_ASSETS } from "../constants/envConstants";
import { logger } from "../utils/logger";
import { prisma } from "database";
import type {
  Order,
  Asset,
  reasonForClose,
  redisPriceData,
} from "../constants/types";

export const startLiquidationChecker = () => {
  setInterval(async () => {
    for (const asset of SUPPORTED_ASSETS) {
      try {
        const latestPrice = priceMap.get(asset);
        if (!latestPrice) {
          logger.info(
            `[Liquidation Check] ${asset}: No price data available yet`,
          );
          continue;
        }

        const lastProcessed = lastPriceMap.get(asset);

        if (!lastProcessed) {
          lastPriceMap.set(asset, {
            bid: latestPrice.bid,
            ask: latestPrice.ask,
          });
          continue;
        }

        // BUY liquidation => bid moved down
        if (latestPrice.bid < lastProcessed.bid) {
          await checkBuyLiquidations(asset, latestPrice.bid, lastProcessed.bid);
        }

        // SELL liquidation => ask moved up
        if (latestPrice.ask > lastProcessed.ask) {
          await checkSellLiquidations(
            asset,
            latestPrice.ask,
            lastProcessed.ask,
          );
        }

        lastPriceMap.set(asset, {
          bid: latestPrice.bid,
          ask: latestPrice.ask,
        });
      } catch (err) {
        logger.error(`Error in liquidation checker for ${asset}:`, err);
      }
    }
  }, 10000);
};

export const updateTrailingStopLoss = async (
  priceData: redisPriceData,
  asset: Asset,
) => {
  const ordersToClose: typeof orders = [];
  const orders = trailingStopLossOrdersMap.get(asset);
  if (!orders) return;

  for (const order of orders) {
    if (order.trailingStopLoss && order.trailingStopLoss.enabled) {
      if (order.type === "BUY") {
        // For BUY orders, we want to update the highest price reached
        if (
          !order.trailingStopLoss.highestPrice ||
          priceData.bid > order.trailingStopLoss.highestPrice
        ) {
          order.trailingStopLoss.highestPrice = priceData.bid;
          order.stopLoss =
            priceData.bid - order.trailingStopLoss.trailingDistance;
          dirtyOrders.add(order.orderId); // Mark order as dirty for DB update
          logger.info(
            `Updated trailing stop loss for BUY order ${order.orderId}: new stop loss at ${order.stopLoss / 1000000} USD`,
          );
        }
      } else if (priceData.bid < order.stopLoss!) {
        ordersToClose.push(order);
      }
    } else {
      // For SELL orders, we want to update the lowest price reached
      if (
        !order.trailingStopLoss!.lowestPrice ||
        priceData.ask < order.trailingStopLoss!.lowestPrice
      ) {
        order.trailingStopLoss!.lowestPrice = priceData.ask;
        order.stopLoss =
          priceData.ask + order.trailingStopLoss!.trailingDistance;
        dirtyOrders.add(order.orderId); // Mark order as dirty for DB update
        logger.info(
          `Updated trailing stop loss for SELL order ${order.orderId}: new stop loss at ${order.stopLoss / 1000000} USD`,
        );
      } else if (priceData.ask > order.stopLoss!) {
        ordersToClose.push(order);
      }
    }
  }
  for (const order of ordersToClose) {
    if (order.type === "BUY") {
      await closeOrder(
        order.orderId,
        order.userId,
        order.type,
        priceData.bid,
        order,
        "stop_loss" as reasonForClose,
      );
    } else {
      await closeOrder(
        order.orderId,
        order.userId,
        order.type,
        priceData.ask,
        order,
        "stop_loss" as reasonForClose,
      );
    }
    dirtyOrders.delete(order.orderId);
  }
};

export const startUpdateTSLtoDb = async () => {
  setInterval(async () => {
    const allOrders = Array.from(trailingStopLossOrdersMap.values()).flat();
    const ordersToUpdate = allOrders.filter((o) => dirtyOrders.has(o.orderId));
    if (ordersToUpdate.length === 0) {
      // logger.info("No orders found for TSL updates");
      return;
    }
    dirtyOrders.clear(); // Clear the set immediately to avoid duplicate updates in case of errors

    await Promise.allSettled(
      ordersToUpdate.map(async (order) => {
        try {
          await prisma.activeOrder.update({
            where: { orderId: order.orderId },
            data: {
              stopLoss: order.stopLoss,
              trailingStopLossEnabled: order.trailingStopLoss!.enabled,
              trailingStopLossDistance:
                order.trailingStopLoss!.trailingDistance,
              trailingStopLossHighestPrice:
                order.trailingStopLoss!.highestPrice,
              trailingStopLossLowestPrice: order.trailingStopLoss!.lowestPrice,
            },
          });
        } catch (err) {
          dirtyOrders.add(order.orderId); // Re-add to dirty set for retry in next cycle
          logger.error(
            `Error updating TSL for order ${order.orderId} in DB:`,
            err,
          );
        }
      }),
    );
  }, 5000);
};
