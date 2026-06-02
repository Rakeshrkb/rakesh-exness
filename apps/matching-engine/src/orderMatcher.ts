import type {
  Asset,
  orderSides,
  PriceLevel,
  LimitOrderData,
  OrderStatus,
  OrderToBeFilled,
} from "./interfaces";
// import { OrderObject } from './interfaces';
import { allOrdersMap, LimitOrderBook, removeIdFromBook } from "./memory";
import { sendOrderUpdateToWSS } from "./redis";
import { prisma } from "database";
import { Prisma } from "@prisma/client";
import { limitOrderConsumer } from "./kafka";

export const processLimitOrders = async () => {
  limitOrderConsumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const data = JSON.parse(message.value?.toString() ?? "{}");
        console.log(`[INFO] Received LIMIT Order`, data.orderId);
        const orderId = data.orderId;
        allOrdersMap.set(orderId, data);
        matchOrder(data);
      } catch (error) {
        console.error("[ERROR] Error processing message:", error);
      }
    },
  });
};

export function matchOrder(order: LimitOrderData) {
  const { orderId, userId, symbol, priceAt, quantity, side } = order;
  const matchingOrders = findMatchingOrders(symbol, priceAt, side);
  const orderQueue: OrderToBeFilled[] = []; // orders those are filled in this matching process

  if (matchingOrders.length === 0) {
    // No matching orders, add to book
    addOrderToOrderBook(order);
    return;
  }

  let remainingQuantity = quantity;

  for (const { id: matchingOrderId, price: ghostPrice } of matchingOrders) {
    const matchingOrder = allOrdersMap.get(matchingOrderId);
    if (!matchingOrder) {
      const oppositeSide = side === "buy" ? "sell" : "buy";
      removeIdFromBook(symbol, oppositeSide, ghostPrice, matchingOrderId);
      console.log(
        `[CLEANUP] Removed ghost ${matchingOrderId} from ${ghostPrice}`,
      );
      continue;
    }

    const fillQuantity = Math.min(remainingQuantity, matchingOrder.quantity);
    matchingOrder.quantity -= fillQuantity;
    matchingOrder.filledQuantity = (matchingOrder.filledQuantity ?? 0) + fillQuantity;
    remainingQuantity -= fillQuantity;
    allOrdersMap.set(matchingOrderId, matchingOrder);

    if (remainingQuantity < 0) {
      console.error(`[ERROR] Negative remaining quantity for order ${orderId}`);
      break;
    }

    if (remainingQuantity > 0) {
      // then matching order is fully filled, we need to update its status and remove from book
      orderQueue.push({ orderId: matchingOrderId, quantity: fillQuantity });
    } else if (remainingQuantity === 0) {
      // then matching order is partially filled, we need to update its quantity and status but not remove from book
      orderQueue.push({ orderId: matchingOrderId, quantity: fillQuantity });
      break; // current order is fully filled, we can stop processing further matching orders
    } else {
      // This case should not happen due to the check above, but we can log it just in case
      console.warn(
        `[WARN] Remaining quantity is zero for order ${orderId} after processing matching order ${matchingOrderId}`,
      );
    }
  }

  if (remainingQuantity > 0) {
    // after processing all matching orders, if we still have remaining quantity, we need to add the current order to book with updated quantity
    const updatedOrder = { ...order, quantity: remainingQuantity };
    addOrderToOrderBook(updatedOrder);
  } else if (remainingQuantity === 0) {
    // current order is fully filled, we can just update its status to FILLED and not add to book
    const updatedOrder = {
      ...order,
      quantity: 0,
      filledQuantity: order.quantity,
      status: "FILLED" as OrderStatus,
    };
    removeFromOrderBook(order);
    allOrdersMap.set(orderId, updatedOrder);
    const userOrdersChannel = `order:${userId}`;
    sendOrderUpdateToWSS(userOrdersChannel, JSON.stringify(updatedOrder));
  }

  // After processing all matching orders, we need to update the status and quantity of those matching orders in book and map
  for (const filledOrder of orderQueue) {
    const filledOrderData = allOrdersMap.get(filledOrder.orderId);
    if (!filledOrderData) continue;
    if (filledOrder.quantity === filledOrderData.quantity) {
      // then this matching order is fully filled, we can update its status to FILLED and remove from book
      const updatedOrder = {
        ...filledOrderData,
        quantity: 0,
        filledQuantity: filledOrderData.quantity, // to ensure we send the original quantity that got filled
        status: "FILLED" as OrderStatus,
      };
      allOrdersMap.set(filledOrder.orderId, updatedOrder);
      prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        tx.spotOrders.update({
          where: { id: filledOrder.orderId },
          data: {
            filledQuantity: { increment: filledOrder.quantity },
            status: "FILLED",
          },
        });
      });
      removeFromOrderBook(filledOrderData);
      const userOrdersChannel = `order:${filledOrderData.userId}`;
      sendOrderUpdateToWSS(userOrdersChannel, JSON.stringify(updatedOrder));
    } else if (filledOrder.quantity < filledOrderData.quantity) {
      // then this matching order is partially filled, we can update its quantity and status but not remove from book
      const updatedOrder = {
        ...filledOrderData,
        quantity: filledOrderData.quantity - filledOrder.quantity,
        status: "PARTIALLY_FILLED" as OrderStatus,
      };
      allOrdersMap.set(filledOrder.orderId, updatedOrder);
      const userOrdersChannel = `order:${filledOrderData.userId}`;
      sendOrderUpdateToWSS(userOrdersChannel, JSON.stringify(updatedOrder));
    }
  }
}

export function findMatchingOrders(
  symbol: Asset,
  price: number,
  side: "buy" | "sell",
) {
  const oppositeSide = side === "buy" ? "sell" : "buy";
  const oppositeBook = LimitOrderBook.get(symbol)?.get(oppositeSide);
  if (!oppositeBook) return [];

  const matchingPrices = [...oppositeBook.keys()]
    .filter((p) => (side === "buy" ? p <= price : p >= price))
    .sort((a, b) => (side === "buy" ? a - b : b - a));
  // buy: sort asks ascending  (cheapest first)
  // sell: sort bids descending (highest first)

  return matchingPrices.flatMap((p) =>
    (oppositeBook.get(p) ?? []).map((id) => ({ id, price: p })),
  );
}

export function addOrderToOrderBook(order: LimitOrderData) {
  const { orderId, symbol, priceAt, side } = order;
  const bookSide = LimitOrderBook.get(symbol)?.get(side);
  if (!bookSide) return;
  if (!bookSide.has(priceAt)) {
    bookSide.set(priceAt, []);
  }
  bookSide.get(priceAt)?.push(orderId);
  allOrdersMap.set(orderId, order);
}

export function removeFromOrderBook(order: LimitOrderData) {
  const { orderId, symbol, priceAt, side } = order;
  const bookSide = LimitOrderBook.get(symbol)?.get(side);
  if (!bookSide) return;
  const ordersAtPrice = bookSide.get(priceAt);
  if (!ordersAtPrice) return;
  const index = ordersAtPrice.indexOf(orderId);
  if (index > -1) {
    ordersAtPrice.splice(index, 1);
    if (ordersAtPrice.length === 0) {
      bookSide.delete(priceAt);
    }
  }
}
