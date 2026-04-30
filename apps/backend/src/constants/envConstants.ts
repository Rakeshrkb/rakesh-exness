import dotenv from "dotenv";

dotenv.config();

const getEnvVar = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Environment variable ${key} is missing!`);
  }
  return value;
};

const JWT_SECRET = getEnvVar("JWT_SECRET");
const JWT_EXPIRES_IN = getEnvVar("JWT_EXPIRES_IN");
const PORT = getEnvVar("PORT");
const KAFKA_BROKER = getEnvVar("KAFKA_BROKER");

export const SUPPORTED_ASSETS = ["BTC", "ETH", "SOL"] as const;
export const SUPPORTED_ORDER_SIDES = ["BUY", "SELL"] as const;
export const SUPPORTED_ORDER_TYPES = ["MARKET", "LIMIT"] as const;

export {PORT, JWT_SECRET, JWT_EXPIRES_IN, KAFKA_BROKER};