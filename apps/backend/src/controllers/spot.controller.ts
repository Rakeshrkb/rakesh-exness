import { matching_engine_producer } from "../kafka/kafkaproducer";
import { v4 as uuidv4 } from "uuid";
import type { Request, Response } from "express";
import { ApiError } from "../utils/apiError";
import { ApiResponse } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import { toInternalPrice } from "../utils/constantUtils";
import {
  getPriceOfAsset,
  getUserById,
  updateUserBalance,
} from "../data/store";
import { prisma } from "database";
import {
  SUPPORTED_ASSETS,
  SUPPORTED_ORDER_SIDES,
} from "../constants/envConstants";
import { logger } from "../utils/logger";

export const sendMessageToKafka = async (message: any) => {
  try {
    await matching_engine_producer.send({
      topic: "limit-orders",
      messages: [{ value: JSON.stringify(message) }],
    });
    logger.info(`Message sent to Kafka topic limit-orders:`, message);
  } catch (error) {
    logger.error(`Failed to send message to Kafka topic limit-orders:`, error);
  }
};

export const createSpotOrder = asyncHandler(
  async (req: Request, res: Response) => {
    const { symbol, quantity, side, orderType } = req.body;

    if (!symbol || !quantity || !side || !orderType) {
      throw new ApiError(
        "Symbol, quantity, side, and orderType are required",
        400,
      );
    }

    // get user
    const userId = req.user.userId;
    const user = getUserById(String(userId)); // can be skipped as auth middleware ensures user already exists

    if (!user) {
      throw new ApiError("User not found", 404);
    }

    // get price
    const priceData = getPriceOfAsset(symbol);
    if (!priceData) {
      throw new ApiError("Asset not supported", 400);
    }

    if (side === "BUY" && orderType === "MARKET") {
      const priceInCents = Math.floor(priceData.ask / 100);
      const totalCostInCents = quantity * priceInCents; // using ask price for buy orders
      if (totalCostInCents > user.balanceCents) {
        throw new ApiError("Insufficient balance", 400);
      }

      const freshUser = await prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
          where: { userId: String(userId) },
        });

        if (!user) {
          throw new ApiError("User not found", 404);
        }

        if (user.balanceCents < totalCostInCents) {
          throw new ApiError("Insufficient balance", 400);
        }

        const updatedUser = await tx.user.update({
          where: { userId: String(userId) },
          data: {
            balanceCents: { decrement: totalCostInCents },
          },
        });

        await tx.balance.upsert({
          where: {
            userId_asset: {
              userId: String(userId),
              asset: symbol,
            },
          },
          update: {
            available: { increment: quantity },
          },
          create: {
            userId: String(userId),
            asset: symbol,
            available: quantity,
            frozen: 0,
          },
        });

        return updatedUser;
      });

      updateUserBalance(String(userId), freshUser.balanceCents);

      return new ApiResponse(
        201,
        {
          order: {
            orderId: uuidv4(),
            userId: String(userId),
            symbol,
            quantity,
            side,
            price: priceData.ask, // using ask price for buy orders
            status: "FILLED",
            timestamp: Date.now(),
          },
        },
        "Order created and filled successfully",
      );
    }

    if (side === "SELL" && orderType === "MARKET") {
      const priceInCents = Math.floor(priceData.bid / 100);
      const totalCostInCents = quantity * priceInCents; // using bid price for sell orders

      const assetHoldings = await prisma.$transaction(async (tx) => {
        const assetBalance = await tx.balance.findUnique({
          where: {
            userId_asset: {
              userId: String(userId),
              asset: symbol,
            },
          },
        });
        if (!assetBalance || assetBalance.available < quantity) {
          throw new ApiError("Insufficient asset quantity to sell", 400);
        }

        const updatedBalance = await tx.balance.update({
          where: {
            userId_asset: {
              userId: String(userId),
              asset: symbol,
            },
          },
          data: {
            available: { decrement: quantity }, // Decrease available quantity
          },
        });

        await tx.user.update({
          where: { userId: String(userId) },
          data: {
            balanceCents: { increment: totalCostInCents }, // Credit the user's balance with the proceeds from the sale
          },
        });

        return updatedBalance;
      });

      return new ApiResponse(
        201,
        {
          order: {
            orderId: uuidv4(),
            userId: String(userId),
            symbol,
            quantity,
            side,
            price: priceData.bid, // using bid price for sell orders
            status: "FILLED",
            timestamp: Date.now(),
          },
        },
        "Order created and filled successfully",
      );
    }
  },
);

export const getUserSpotHoldings = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user.userId;
    const spotOrders = await prisma.balance.findMany({
      where: { userId: String(userId) },
    });
    return new ApiResponse(
      200,
      { orders: spotOrders },
      "User spot orders retrieved",
    );
  },
);

export const createLimitOrder = asyncHandler(
  async (req: Request, res: Response) => {
    const { symbol, quantity, side, priceAt, orderType } = req.body;

    if (!symbol || !quantity || !side || !priceAt || orderType !== "LIMIT") {
      throw new ApiError(
        "Symbol, quantity, side, and price are required for limit orders",
        400,
      );
    }

    if (!SUPPORTED_ASSETS.includes(symbol)) {
      throw new ApiError("Asset not supported", 400);
    }

    if (!SUPPORTED_ORDER_SIDES.includes(side)) {
      throw new ApiError("Order side not supported", 400);
    }

    if (priceAt <= 0 || quantity <= 0) {
      throw new ApiError("Price and quantity must be greater than 0", 400);
    }

    const userId = req.user.userId;
    const AssetPrice = getPriceOfAsset(symbol);
    if (!AssetPrice) {
      throw new ApiError("Asset not supported", 400);
    }

    const order = await prisma.$transaction(async (tx) => {
      if(side === "BUY") {
        const p = toInternalPrice(priceAt);
        const totalCostInCents = Math.floor((quantity * p)/100); // using user specified price for limit orders
        const user = await tx.user.findUnique({
          where: { userId: String(userId) },
        });

        if (!user) {
          throw new ApiError("User not found", 404);
        }

        if (user.balanceCents < totalCostInCents) {
          throw new ApiError("Insufficient balance", 400);
        }

        await tx.user.update({
          where: { userId: String(userId) },
          data: {
            balanceCents: { decrement: totalCostInCents },
            freezedBalanceCents: { increment: totalCostInCents },
          },
        });

      } else if (side === "SELL") {
        const assetBalance = await tx.balance.findUnique({
          where: {
            userId_asset: {
              userId: String(userId),
              asset: symbol,
            },
          },
        });
        if (!assetBalance || assetBalance.available < quantity) {
          throw new ApiError("Insufficient asset quantity to sell", 400);
        }

        await tx.balance.update({
          where: {
            userId_asset: {
              userId: String(userId),
              asset: symbol,
            },
          },
          data: {
            available: { decrement: quantity }, // Decrease available quantity
            frozen: { increment: quantity }, // Freeze the quantity for the limit sell order
          },
        });
      }

      const newOrder = await tx.spotOrders.create({
        data: {
          id: uuidv4(),
          userId: String(userId),
          symbol,
          quantity,
          side,
          price: priceAt, // Store price in internal format
          type: orderType,
          status: "PENDING",
        },
      });

      return newOrder;
    });

      // Send order details to Kafka for matching engine
      await sendMessageToKafka({
        orderId: order.id,
        userId: order.userId,
        symbol: order.symbol,
        quantity: order.quantity,
        side: order.side,
        priceAt: order.price,
        orderType: order.type,
        status: order.status,
        timestamp: order.createdAt,
      });

    return new ApiResponse(201, { order: order }, "Limit order created successfully");
  },
);
