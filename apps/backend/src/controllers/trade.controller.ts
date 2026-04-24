import type { Request, Response } from "express";
import { SUPPORTED_ASSETS } from "../constants/envConstants";
import { FEE_PERCENTAGE, type Order } from "../constants/types";
import { broadCastOrderOpened, broadCastOrderClosed } from "../services/orderBroadcast";
import { onOrderOpened } from "../services/platformProfit";
import {
  getPriceOfAsset,
  getUserById,
  getUserOrders,
  addOrderForUser,
} from "../data/store";
import {
  calculateLiquidation,
  centsToUsd,
  fromInternalPrice,
  toInternalPrice,
  usdToCents,
} from "../utils/constantUtils";
import { randomUUID } from "crypto";
import { prisma } from "database";
import { ApiError } from "../utils/apiError";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/apiResponse";
import { closeOrder, addOrderToBucket } from "../utils/tradeUtils";
import { logger } from "../utils/logger";

export const openTradeController = asyncHandler(async (req: Request, res: Response) => {
    const {
      asset,
      type,
      margin,
      leverage,
      takeProfit,
      stopLoss,
      trailingStopLoss,
    } = req.body;

    // 🔹 Basic validation
    if (!asset || !type || !margin || !leverage) {
      throw new ApiError("Missing required fields", 400);
    }

    if (!SUPPORTED_ASSETS.includes(asset)) {
      throw new ApiError("Unsupported asset", 400);
    }

    const userId = req.user.userId;
    const user = getUserById(String(userId));

    if (!user) {
      throw new ApiError("User not found", 404);
    }

    const userBalance = user.balanceCents;

    // 🔹 Convert margin
    const marginInCents = usdToCents(margin);
    const openFee = Math.floor(marginInCents * FEE_PERCENTAGE);
    const totalCost = marginInCents + openFee;

    if (userBalance < totalCost) {
      throw new ApiError("Insufficient balance (margin + fee)", 400);
    }

    // 🔹 Get price
    const priceData = getPriceOfAsset(asset);
    if (!priceData || priceData.ask === 0 || priceData.bid === 0) {
      throw new ApiError("Price not available", 503);
    }

    const entryPrice = type === "BUY" ? priceData.ask : priceData.bid;

    // 🔹 Liquidation
    const liquidationPrice = calculateLiquidation(
      entryPrice,
      leverage,
      type
    );

    // 🔹 TP validation (price-based)
    if (takeProfit) {
      const tp = toInternalPrice(takeProfit);

      if (type === "BUY" && tp <= entryPrice) {
        throw new ApiError("Take profit must be above entry price (BUY)", 400);
      }

      if (type === "SELL" && tp >= entryPrice) {
        throw new ApiError("Take profit must be below entry price (SELL)", 400);
      }
    }

    // 🔹 SL validation
    if (stopLoss) {
      const sl = toInternalPrice(stopLoss);

      if (type === "BUY" && sl >= entryPrice) {
        throw new ApiError("Stop loss must be below entry price (BUY)", 400);
      }

      if (type === "SELL" && sl <= entryPrice) {
        throw new ApiError("Stop loss must be above entry price (SELL)", 400);
      }
    }

    // 🔹 Generate order ID
    const orderId = randomUUID();

    // 🔹 Trailing Stop Loss (optional)
    let trailingStopLossData: Order["trailingStopLoss"] = undefined;

    if (trailingStopLoss?.enabled) {
      const tslDistance = trailingStopLoss.trailingDistance;

      if (!tslDistance || tslDistance <= 0) {
        throw new ApiError("Invalid trailing stop loss distance", 400);
      }

      const minTslDistance = 10;
      if (tslDistance < minTslDistance) {
        throw new ApiError(`TSL must be >= $${minTslDistance}`, 400);
      }

      const distanceToLiquidation = Math.abs(
        fromInternalPrice(entryPrice) -
          fromInternalPrice(liquidationPrice)
      );

      if (tslDistance >= distanceToLiquidation) {
        throw new ApiError(
          "Trailing stop loss distance must be less than distance to liquidation",
          400
        );
      }

      const trailingDistanceInPriceScale = toInternalPrice(tslDistance);

      trailingStopLossData = {
        enabled: true,
        trailingDistance: trailingDistanceInPriceScale,
        highestPrice: type === "BUY" ? entryPrice : undefined,
        lowestPrice: type === "SELL" ? entryPrice : undefined,
      };
    }

    // 🔹 Create orderDetails (ALWAYS OUTSIDE)
    const orderDetails: Order = {
      orderId,
      userId,
      asset,
      type,
      margin: marginInCents,
      initialMargin: marginInCents,
      addedMargin: 0,
      leverage,
      openPrice: entryPrice,
      openTimestamp: Date.now(),
      liquidationPrice,
      takeProfit: takeProfit ? toInternalPrice(takeProfit) : undefined,
      stopLoss: stopLoss ? toInternalPrice(stopLoss) : undefined,
      trailingStopLoss: trailingStopLossData,
    };

    // 🔥 TRANSACTION (atomic)
    let actualNewBalance: number;

    try {
      actualNewBalance = await prisma.$transaction<number>(async (tx) => {
        const freshUser = await tx.user.findUnique({
          where: { userId },
        });

        if (!freshUser || freshUser.balanceCents < totalCost) {
          throw new Error("Insufficient balance");
        }

        const newBalance = freshUser.balanceCents - totalCost;

        await tx.user.update({
          where: { userId },
          data: { balanceCents: newBalance },
        });

        await tx.activeOrder.create({
          data: {
            orderId: orderDetails.orderId,
            userId: orderDetails.userId,
            asset: orderDetails.asset,
            type: orderDetails.type,
            margin: orderDetails.margin,
            initialMargin: orderDetails.initialMargin,
            addedMargin: orderDetails.addedMargin,
            leverage: orderDetails.leverage,
            openPrice: orderDetails.openPrice,
            liquidationPrice: orderDetails.liquidationPrice,
            takeProfit: orderDetails.takeProfit || null,
            stopLoss: orderDetails.stopLoss || null,
            openedAt: new Date(orderDetails.openTimestamp),
            trailingStopLossEnabled:
              orderDetails.trailingStopLoss?.enabled || false,
            trailingStopLossDistance:
              orderDetails.trailingStopLoss?.trailingDistance || null,
            trailingStopLossHighestPrice:
              orderDetails.trailingStopLoss?.highestPrice || null,
            trailingStopLossLowestPrice:
              orderDetails.trailingStopLoss?.lowestPrice || null,
          },
        });

        return newBalance;
      });
    } catch (err) {
      logger.error("[OPEN] Transaction failed:", err);
      throw new ApiError("Failed to open trade due to a server error", 500);
    }

    // 🔹 Update in-memory state
    user.balanceCents = actualNewBalance;
    addOrderForUser(userId, orderId, orderDetails);

    // 🔹 Optional async tasks
    try {
      await broadCastOrderOpened(orderDetails);
    } catch (err) {
      logger.error("Broadcast failed", err);
    }

    try {
      onOrderOpened(orderDetails);
    } catch (err) {
      logger.error("Platform profit update failed", err);
    }

    // add order to bucket for liquidation checks
    try {
      addOrderToBucket(orderDetails);
    } catch (err) {
      logger.error("Adding order to bucket failed", err);
    }

    // 🔹 Final response
    return new ApiResponse(201, {
      order: orderDetails,
      fee: openFee,
      newBalance: centsToUsd(actualNewBalance),
    }, "Trade opened successfully");
});

// get open orders for user
export const checkOpenOrdersController = asyncHandler( async (req: Request, res: Response) => {
  // Implementation for checking open orders would go here
  const userId = req.user.userId;
  logger.info("[TRADE] Checking open orders for userId:", userId);
  const user = getUserById(String(userId));

  if (!user) {
    logger.info("[TRADE] User not found", userId);
    throw new ApiError("User not found", 404);
  }

  const UserOpenOrders = getUserOrders(String(userId));
  // converted map to array when sending response cause map is not serializable
  return new ApiResponse(200, { orders: Array.from(UserOpenOrders.values()) }, "Open orders retrieved successfully");
});

// add margin to existing order
export const addMarginController =  asyncHandler( async (req: Request, res: Response) => {
  const { orderId, additionalMargin } = req.body;

  if (!orderId || !additionalMargin) {
    throw new ApiError("Missing required fields", 400);
  }

  const userId = req.user.userId;
  const user = getUserById(String(userId));

  if (!user) {
    throw new ApiError("User not found", 404);
  }

  const userBalance = user.balanceCents;
  const additionalMarginInCents = usdToCents(additionalMargin);
  const userOrders = getUserOrders(String(userId));
  const order = userOrders.get(orderId);

  if (!order) {
    throw new ApiError("Order not found", 404);
  }

  const addMarginFee = Math.floor(additionalMarginInCents * FEE_PERCENTAGE);
  const newAddedMargin = order.addedMargin + additionalMarginInCents;
  const totalCost = additionalMarginInCents + addMarginFee;
  const newTotalMargin = order.margin + additionalMarginInCents;

    if (userBalance < totalCost) {
    throw new ApiError("Insufficient balance for additional margin", 400);
  }

  // calculate new liquidation price with updated margin
  const positionSize = order.initialMargin * order.leverage;
  const effectiveLeverage = positionSize / newTotalMargin;
      const newLiquidationPrice = calculateLiquidation(
      order.openPrice,
      effectiveLeverage,
      order.type,
    );

    try{
      await prisma.$transaction(async (tx) => {
        // update user balance 
        await tx.user.update({
          where: { userId },
          data: { balanceCents: userBalance - totalCost },
        });

        // 2. Update active order (atomic)
        await tx.activeOrder.update({
          where: { orderId },
          data: {
            margin: newTotalMargin,
            addedMargin: newAddedMargin,
            liquidationPrice: newLiquidationPrice,
          },
        });

        user.balanceCents = userBalance - totalCost;
        order.addedMargin = newAddedMargin;
        order.margin = newTotalMargin;
        order.liquidationPrice = newLiquidationPrice;
      }
    )} catch (err) {
      logger.error("[ADD MARGIN] Transaction failed:", err);
      throw new ApiError("Failed to add margin due to a server error", 500);
    }

  // add platform profit 
  try {
    onOrderOpened(order);
  } catch (err) {
    logger.error("Platform profit update failed", err);
  }

  logger.info(`[ADD MARGIN] Margin added for orderId: ${orderId}, newMargin: ${centsToUsd(newTotalMargin)}, fee: ${addMarginFee}, newBalance: ${centsToUsd(user.balanceCents)}`);

  return new ApiResponse(200, {
    orderId,
    newMargin: centsToUsd(newTotalMargin),
    fee: addMarginFee,
    newBalance: centsToUsd(user.balanceCents),
  }, "Margin added successfully");
});

// close existing order
export const closeTradeController = asyncHandler( async (req: Request, res: Response) => {
  // Implementation for closing a trade would go here
  const { orderId } = req.body;
  if (!orderId) {
    throw new ApiError("Missing orderId", 400);
  }

  const userId = req.user.userId;
  const user = getUserById(String(userId));

  if (!user) {
    throw new ApiError("User not found", 404);
  }

  const userOrders = getUserOrders(String(userId));
  const order = userOrders.get(orderId);

  if (!order) {
    throw new ApiError("Order not found", 404);
  }

  const currentPrice = getPriceOfAsset(order.asset);
  if (!currentPrice || currentPrice.ask === 0 || currentPrice.bid === 0) {
    throw new ApiError("Price not available", 503);
  }

  const closePrice = order.type === "BUY" ? currentPrice.bid : currentPrice.ask;
  
  const {pnl, closedOrderData} = await closeOrder(orderId, String(userId), order.type, closePrice, order, "manual" );

  logger.info("normal pnl in cents:", pnl);

  const pnlInUsd = centsToUsd(pnl!);

  logger.info(`[CLOSE TRADE] Order closed successfully for orderId: ${orderId}, PnL: ${pnlInUsd}, newBalance: ${centsToUsd(user.balanceCents)}`);

    // Broadcast closed order
  try {  
    await broadCastOrderClosed(closedOrderData, pnl!);
  } catch (err) {
    logger.error("Broadcast failed", err);
  }

  return new ApiResponse(200, {
    orderId,
    pnl: pnlInUsd,
    newBalance: centsToUsd(user.balanceCents),
  }, "Trade closed successfully");
});