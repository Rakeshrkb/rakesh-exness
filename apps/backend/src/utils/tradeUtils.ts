import { prisma } from "database";
import type { ClosedOrder, OrderType } from "../constants/types";
import { FEE_PERCENTAGE, type Order, BUCKET_SIZE, type reasonForClose } from "../constants/types";
import { closedOrdersMap, getUserById, activeOrdersMap, updateUserBalance, bucketMap, lastPriceMap, priceMap } from "../data/store";
import { ApiError } from "./apiError";
import { logger } from "./logger";

export const closeOrder = async (orderId: string, userId: string, orderType: OrderType, closePrice: number, order: Order, closeReason: reasonForClose) => {
  const user = getUserById(userId);
  if (!user) {
    throw new Error("User not found");
  }
  const openPrice = order.openPrice;
  const totalMargin = order.margin;
  const leverage = order.leverage;
  const positionSize = order.initialMargin * leverage;
  const closeFee = totalMargin * FEE_PERCENTAGE; // exit fee based on total margin

  let pnl = 0;
  if (orderType === "BUY") {
    pnl = (closePrice - openPrice) * positionSize / openPrice;
  } else if (orderType === "SELL") {
    pnl = (openPrice - closePrice) * positionSize / openPrice;
  }
  const newUserBalance = user.balanceCents + pnl - closeFee;
  try {
    await prisma.$transaction(async (tx) => {
      // create closed order record
      await tx.closedOrder.create({
        data: {
          orderId,
          userId,
          asset: order.asset,
          type: order.type,
          margin: order.margin,
          initialMargin: order.initialMargin,
          addedMargin: order.addedMargin,
          leverage: order.leverage,
          openPrice: order.openPrice,
          closePrice: closePrice,
          liquidationPrice: order.liquidationPrice,
          takeProfit: order.takeProfit,
          stopLoss: order.stopLoss,
          pnl,
          closeReason: closeReason, // or "liquidation", "takeProfit", "stopLoss" based on how the order was closed
          closeMessage: `Order closed with PnL: ${pnl.toFixed(2)}`,
          openedAt: new Date(order.openTimestamp),
          closedAt: new Date(),
          trailingStopLossEnabled: order.trailingStopLoss?.enabled || false,
          trailingStopLossDistance: order.trailingStopLoss?.trailingDistance || null,
          trailingStopLossHighestPrice: order.trailingStopLoss?.highestPrice || null,
          trailingStopLossLowestPrice: order.trailingStopLoss?.lowestPrice || null,
        },
      });

      // update user balance 
      await tx.user.update({
        where: { userId: userId },
        data: { balanceCents: newUserBalance },
      });

      // delete active order
      await tx.activeOrder.delete({
        where: { orderId },
      });


    }
    );
  }
  catch (error) {
    logger.error("Error closing order:", error);
    throw new ApiError("Failed to update user balance", 500);
  }
  // prepare closed order data for in-memory store
  const closedOrderData: ClosedOrder = {
    ...order,
    closePrice,
    closeTimestamp: Date.now(),
    pnl,
    closeReason: closeReason,
  };

  const userClosedOrders = closedOrdersMap.get(userId);
  userClosedOrders?.set(orderId, closedOrderData);
  const userOrders = activeOrdersMap.get(userId);
  userOrders?.delete(orderId);
  updateUserBalance(userId, newUserBalance);

  return { pnl, closedOrderData };
};

export const calculateBucketKey = (price: number) => {
  return Math.floor(price / BUCKET_SIZE) * BUCKET_SIZE;
}

export const addOrderToBucket = (order: Order) => {
  // calculate bucket key based on liquidation price
  const bucketKey = calculateBucketKey(order.liquidationPrice);
  if (!bucketMap.has(order.asset)) {
    bucketMap.set(order.asset, new Map());
  }
  // ensure asset and side maps exist
  const assetMap = bucketMap.get(order.asset)!;
  if (!assetMap.has(order.type)) {
    assetMap.set(order.type, new Map());
  }
  // add order to the appropriate bucket
  const sideMap = assetMap.get(order.type)!;
  if (!sideMap.has(bucketKey)) {
    sideMap.set(bucketKey, new Set());
  }
  // add order to bucket
  sideMap.get(bucketKey)!.add(order);
  logger.info(`One ${order.asset} order added to bucket ${bucketKey}`);
}


// export const initLiquidationChecker = async (
//   asset: string,
//   currentBid: number,
//   currentAsk: number
// ) => {
//   const lastPrice = lastPriceMap.get(asset);

//   if (!lastPrice) {
//     lastPriceMap.set(asset, {
//       bid: currentBid,
//       ask: currentAsk,
//     });
//     return;
//   }

//   if (currentBid < lastPrice.bid) {
//     await checkBuyLiquidations(asset, currentBid, lastPrice.bid);
//   }

//   if (currentAsk > lastPrice.ask) {
//     await checkSellLiquidations(asset, currentAsk, lastPrice.ask);
//   }

//   lastPriceMap.set(asset, {
//     bid: currentBid,
//     ask: currentAsk,
//   });
// };


export const checkBuyLiquidations = async (asset: string, currentBid: number, lastPrice: number) => {
  const assetMap = bucketMap.get(asset);
  if (!assetMap) return;

  const sideMap = assetMap.get("BUY");
  if (!sideMap) return;
  // Step 1: get bucket range
  const prevBucketKey = calculateBucketKey(lastPrice);
  const currentBucketKey = calculateBucketKey(currentBid);

  const closePromises: Promise<any>[] = [];
  // let foundAnyOrders = false;

  // Step 2: loop ONLY crossed buckets (downward)
  for (let bucketKey = prevBucketKey; bucketKey >= currentBucketKey; bucketKey -= BUCKET_SIZE) {
    const orders = sideMap.get(bucketKey);
    if (!orders || orders.size === 0) continue;
    // foundAnyOrders = true;
    for (const order of Array.from(orders)) {
      if (currentBid <= order.liquidationPrice) {
        // ✅ remove first to prevent double liquidation
        orders.delete(order);

        // optional: also remove from activeOrdersMap here if needed

        closePromises.push(
          closeOrder(
            order.orderId,
            order.userId,
            order.type,
            currentBid,
            order,
            "liquidation"
          )
        );
        logger.info(`[BUY] order Liquidated at price ${currentBid}`);
      }
    }// Step 4: clean empty bucket
    if (orders.size === 0) {
      sideMap.delete(bucketKey);
    }
    // wait for all DB closes in parallel
  }
  // if (!foundAnyOrders) {
  //   logger.info(
  //     `[BUY] ${asset}: No BUY positions found between (${prevBucketKey} -> ${currentBucketKey})`
  //   );
  // }
  const results = await Promise.allSettled(closePromises);
}

export const checkSellLiquidations = async (
  asset: string,
  currentAsk: number,
  lastPrice: number
) => {
  const assetMap = bucketMap.get(asset);
  if (!assetMap) return;

  const sideMap = assetMap.get("SELL");
  if (!sideMap) return;

  // Step 1: get bucket range
  const prevBucketKey = calculateBucketKey(lastPrice);
  const currentBucketKey = calculateBucketKey(currentAsk);

  const closePromises: Promise<any>[] = [];
  // let foundAnyOrders = false;

  // Step 2: loop ONLY crossed buckets (upward)
  for (
    let bucketKey = prevBucketKey;
    bucketKey <= currentBucketKey;
    bucketKey += BUCKET_SIZE
  ) {
    const orders = sideMap.get(bucketKey);
    if (!orders || orders.size === 0) continue;
    // foundAnyOrders = true;

    for (const order of Array.from(orders)) {
      if (currentAsk >= order.liquidationPrice) {
        // remove first to prevent double liquidation
        orders.delete(order);

        closePromises.push(
          closeOrder(
            order.orderId,
            order.userId,
            order.type,
            currentAsk,
            order,
            "liquidation"
          )
        );
      }
    }

    // clean empty bucket
    if (orders.size === 0) {
      sideMap.delete(bucketKey);
    }
  }
  // if (!foundAnyOrders) {
  //   logger.info(
  //     `[SELL] ${asset}: No SELL positions found between (${prevBucketKey} -> ${currentBucketKey})`
  //   );
  // }

  // wait for all DB closes in parallel
  const results = await Promise.allSettled(closePromises);
};


