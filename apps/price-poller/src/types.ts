export interface Trades {
  tradeId: number;
  symbol: string;
  price: number;
  quantity: string;
  timestamp: number;
}

export interface typeOfRedishPriceData {
  // interface to publish the data in redis
  symbol: string;
  askPrice: number;
  bidPrice: number;
  decimals: number;
  time: number;
}

export interface typeOfPriceData {
  // interface to publish the data in kafka
  symbol: string;
  price: number;
  tradeId: number;
  timestamp: number;
  quantity: string;
}

export const BINANCE_STREAMS = {
  BTC: "btcusdt@aggTrade",
  ETH: "ethusdt@aggTrade",
  SOL: "solusdt@aggTrade",
} as const;
