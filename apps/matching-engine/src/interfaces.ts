export interface MatchingEngineOrder {
    orderId: string;
    userId: string;
    status: "open" | "partially_filled" | "filled" | "cancelled";
    symbol: string;
    price: number;
    quantity: number;
    side: "buy" | "sell";
    timestamp: string;
}

export interface OrderObject {
    type: "PARTIALLY_FILLED" | "FILLED" | "CANCELLED";
    data: MatchingEngineOrder;
}