// export interface LimitOrder {
//         orderId: order.id,
//         userId: order.userId,
//         symbol: order.symbol,
//         quantity: order.quantity,
//         side: order.side,
//         priceAt: order.price,
//         orderType: order.type,
//         status: order.status,
//         timestamp: order.createdAt,
// }

export interface LimitOrderData {
    orderId: string;
    userId: string;
    symbol: Asset;
    quantity: number;
    filledQuantity?: number; 
    side: orderSides;
    priceAt: number;
    orderType: OrderType;
    status: OrderStatus;
    timestamp: string;
}

export interface OrderToBeFilled {
    orderId: string;
    quantity: number;
}

// export interface MatchingEngineOrder {
//     orderId: string;
//     userId: string;
//     status: "open" | "partially_filled" | "filled" | "cancelled";
//     symbol: Asset;
//     price: number;
//     quantity: number;
//     side: "buy" | "sell";
//     timestamp: string;
// }

export type OrderStatus = "PARTIALLY_FILLED" | "FILLED" | "CANCELLED";
export type OrderType = "LIMIT" | "MARKET";

export const SUPPORTED_ASSETS = ["BTC", "ETH", "SOL"] as const;
export type Asset = (typeof SUPPORTED_ASSETS)[number];

export type orderSides = "buy" | "sell";

// Price -> Array of Order IDs (maintains FIFO)
export type PriceLevel = Map<number, string[]>;
