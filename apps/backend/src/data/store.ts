import type { User, PriceData, Order, ClosedOrder, Asset } from "../constants/types";
import { logger } from "../utils/logger";

export const userStorageMap = new Map<string, User>(); // userId -> User
export const getUserByEmailMap = new Map<string, User>(); // email -> User
export const emailToUserId = new Map<string, string>(); // email -> userId
export const activeOrdersMap = new Map<string, Map<string, Order>>(); // userId -> order details
export const priceMap = new Map<string, PriceData>(); // symbol -> price ex "BTCUSDT" -> 50000
export const closedOrdersMap = new Map<string, Map<string, ClosedOrder>>(); // userId -> closed order details
export const bucketMap = new Map<string, Map<string, Map<number, Set<Order>>>>(); // asset -> side -> bucket-key -> set of orders
export const lastPriceMap = new Map<string, { bid: number; ask: number }>(); // asset -> last price for where the liquidation checked
export const trailingStopLossOrdersMap = new Map<Asset, Order[]>(); // asset -> Order with trailing stop loss
export const dirtyOrders = new Set<string>(); // order IDs that changed and need to be updated in the database

export const storeUserInMap = (
  userId: string,
  email: string,
  password: string,
  balanceCents: number,
) => {
  const user: User = {
    userId,
    email,
    password,
    balanceCents,
  };
  userStorageMap.set(user.userId.toString(), user);
};

// update user balance in map
export const updateUserBalance = (userId: string, newBalanceCents: number) => {
  const user = userStorageMap.get(userId);
  if (user) {
    user.balanceCents = newBalanceCents;
    userStorageMap.set(userId, user);
  }
};

export const getUserByEmail = (email: string): User | undefined => {
  return getUserByEmailMap.get(email);
};

export const getUserById = (userId: string): User | undefined => {
  return userStorageMap.get(userId);
};

export const mapEmailToUserId = (userId: string, email: string) => {
  emailToUserId.set(email, userId);
};

export const getUserIdByEmail = (email: string): string | undefined => {
  return emailToUserId.get(email);
}

export const getPriceOfAsset = (symbol: string): PriceData | undefined => {
  return priceMap.get(symbol);
};

export const getUserOrders = (userId: string): Map<string, Order> => {
  logger.info("Getting orders for userId:", userId);
  if (!activeOrdersMap.has(userId)) {
    activeOrdersMap.set(userId, new Map<string, Order>());
  }
  // return whole map of orders
  return activeOrdersMap.get(userId)!;
};

export const addOrderForUser = (userId: string, orderId: string, orderDetails: Order) => {
  const userOrders = getUserOrders(userId);
  userOrders.set(orderId, orderDetails);
};


export const getClosedOrdersForUser = (userId: string): Map<string, ClosedOrder> => {
  if (!closedOrdersMap.has(userId)) {
    closedOrdersMap.set(userId, new Map<string, ClosedOrder>());
  }
  return closedOrdersMap.get(userId)!;
};

export const addClosedOrderForUser = (userId: string, orderId: string, orderDetails: ClosedOrder) => {
  const userClosedOrders = getClosedOrdersForUser(userId);
  userClosedOrders.set(orderId, orderDetails);
};