import type {OrderType} from "../constants/types";

export const PRICE_SCALE = 10000; //$65234.5678 stored as 652345678 (integer).
export const USD_SCALE = 100;

export function toInternalPrice(price: number): number {
  return Math.floor(price * PRICE_SCALE);
}

export function fromInternalPrice(price: number): number {
  return price / PRICE_SCALE;
}

export const usdToCents = (usd: number): number => {
  return Math.round(usd * 100);
};

export const centsToUsd = (cents: number): number => {
  return cents / 100;
};

// Calculation of liquidation price
export function calculateLiquidation(
  openPrice: number,
  leverage: number,
  side: OrderType
): number {
  if (leverage <= 0) return 0;

  if (side === "BUY") {
    // Long liquidation: openPrice * (1 - 1/leverage)
    return openPrice * (1 - 1 / leverage);
  } else {
    // Short liquidation: openPrice * (1 + 1/leverage)
    return openPrice * (1 + 1 / leverage);
  }
}

