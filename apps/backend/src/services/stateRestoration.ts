import { prisma } from "database";
import { userStorageMap, emailToUserId, activeOrdersMap } from "../data/store";
import type { Asset, OrderType, Order } from "../constants/types";
import { addOrderToBucket } from "../utils/tradeUtils";
import { logger } from "../utils/logger";


export const startStateRestoration = async () => {
    const users = await prisma.user.findMany();
    for (const user of users) {
        userStorageMap.set(user.userId, user);
        emailToUserId.set(user.email, user.userId);
    }
    const orders = await prisma.activeOrder.findMany();
    let totalOrders = 0;
    for (const order of orders) {
        const userId = order.userId;
        if (!userStorageMap.has(userId)) {
            logger.warn(`User with ID ${userId} not found for order ${order.orderId}. Skipping this order.`);
            continue;
        }
        if (!activeOrdersMap.has(userId)) {
            activeOrdersMap.set(userId, new Map());
        }

        const orderDetails: Order = {
            orderId: order.orderId,
            userId: order.userId,
            asset: order.asset as Asset,
            type: order.type as OrderType,
            margin: order.margin,
            initialMargin: order.initialMargin,
            addedMargin: order.addedMargin,
            leverage: order.leverage as 1 | 5 | 10 | 20 | 100,
            openPrice: order.openPrice,
            liquidationPrice: order.liquidationPrice,
            openTimestamp: order.openedAt.getTime(),
            trailingStopLoss: order.trailingStopLossEnabled
                ? {
                    enabled: true,
                    trailingDistance: order.trailingStopLossDistance || 0,
                    highestPrice: order.trailingStopLossHighestPrice || undefined,
                    lowestPrice: order.trailingStopLossLowestPrice || undefined,
                }
                : undefined,
        };

        activeOrdersMap.get(userId)!.set(order.orderId, orderDetails);
        addOrderToBucket(orderDetails);
    }
    for (const [, userOrders] of activeOrdersMap) {
        totalOrders += userOrders.size;
}
    logger.info(`State restoration complete. Users loaded: ${userStorageMap.size}, orders loaded: ${totalOrders}`);
}