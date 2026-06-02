import type { SUPPORTED_ASSETS } from "./envConstants";

export interface User {
  userId: String;
  email: String;
  password: String;
  balanceCents: number;
}

export type OrderType = "BUY" | "SELL";
export type Asset = (typeof SUPPORTED_ASSETS)[number];
export const LEVERAGE_OPTIONS = [1, 5, 10, 20, 100] as const;
export type Leverage = (typeof LEVERAGE_OPTIONS)[number];
export type SpotOrderStatus = "PENDING" | "PARTIALLY_FILLED" | "FILLED" | "CANCELED";

export interface LimitOrderData {
    orderId: string;
    userId: string;
    symbol: Asset;
    quantity: number;
    side: "buy" | "sell";
    priceAt: number;
    orderType: "LIMIT" | "MARKET";
    status: OrderStatus;
    timestamp: string;
}

export interface OrderStatus {
    type: "PARTIALLY_FILLED" | "FILLED" | "CANCELLED";
    data: LimitOrderData;
}


export interface redisPriceData {
  bid: number; // Sell price in PRICE_SCALE
  ask: number; // Buy price in PRICE_SCALE
  decimals: number;
  time: number;
}

export type reasonForClose =
  | "manual"
  | "take_profit"
  | "stop_loss"
  | "liquidation"
  | "partial_close";

export interface ClosedOrder extends Order {
  closePrice: number; // Exit price in PRICE_SCALE
  closeTimestamp: number; // Unix timestamp in milliseconds
  pnl: number; // Profit/Loss in cents (can be negative)
  closeReason: reasonForClose;
}

export interface PriceData {
  bid: number; // Sell price in human-readable format
  ask: number; // Buy price in human-readable format
  decimals: number;
  time: number;
}

export interface PayLoad {
  email: String;
  userId: String;
}

export interface Order {
  orderId: string; // UUID
  userId: string; // UUID
  asset: Asset; // BTC, ETH, or SOL
  type: OrderType; // buy or sell
  margin: number; // Current collateral in cents (can increase with addMargin)
  initialMargin: number; // Original margin when position was opened
  addedMargin: number; // Additional margin added (default: 0)
  leverage: Leverage; // Original leverage (1, 5, 10, 20, or 100)
  openPrice: number; // Entry price in PRICE_SCALE (e.g., $60,000.50 = 600005000)
  openTimestamp: number; // Unix timestamp in milliseconds
  liquidationPrice: number; // Liquidation price in PRICE_SCALE
  takeProfit?: number; // Optional take-profit price in PRICE_SCALE
  stopLoss?: number; // Optional stop-loss price in PRICE_SCALE
  trailingStopLoss?: {
    enabled: boolean; // Is trailing stop loss active
    trailingDistance: number; // Distance from peak/trough in PRICE_SCALE
    highestPrice?: number; // Highest price reached (for BUY orders)
    lowestPrice?: number; // Lowest price reached (for SELL orders)
  };
}

//------------------------------CONSTANTS------------------------------
export const STALE_PRICE_THRESHOLD_MS = 30000; // 30 seconds
export const SnapShot_Interval = 1000; // 1 second
export const FEE_PERCENTAGE = 0.005; // 0.5% spread
export const BUCKET_SIZE = 1000; // Price bucket size in PRICE_SCALE (e.g., 1000 = $1 for 2 decimals)