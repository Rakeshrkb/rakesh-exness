import type { LimitOrderData, Asset, orderSides, PriceLevel } from "./interfaces";
import { SUPPORTED_ASSETS } from "./interfaces";

export const allOrdersMap = new Map<string, LimitOrderData>(); // orderId -> LimitOrderData

// export const bucketMap = new Map<string, Map<string, Map<number, Set<Order>>>>(); // asset -> side -> bucket-key -> set 

// Asset -> Side -> PriceLevel
export const LimitOrderBook = new Map<Asset, Map<orderSides, PriceLevel>>();

// Initialize the book so it's ready to use
SUPPORTED_ASSETS.forEach(asset => {
    const sides = new Map<orderSides, PriceLevel>();
    sides.set("buy", new Map());
    sides.set("sell", new Map());
    LimitOrderBook.set(asset, sides);
});

// A more flexible removal function
export const removeIdFromBook = (symbol: Asset, side: orderSides, price: number, orderId: string) => {
    const bookSide = LimitOrderBook.get(symbol)?.get(side);
    const ordersAtPrice = bookSide?.get(price);
    
    if (ordersAtPrice) {
        const index = ordersAtPrice.indexOf(orderId);
        if (index > -1) {
            ordersAtPrice.splice(index, 1);
            // Clean up the price level if no orders are left
            if (ordersAtPrice.length === 0) bookSide?.delete(price);
        }
    }
};