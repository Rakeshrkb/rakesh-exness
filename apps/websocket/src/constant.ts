export const SUPPORTED_ASSETS = ["BTC", "ETH", "SOL"] as const;
export type Asset = (typeof SUPPORTED_ASSETS)[number];