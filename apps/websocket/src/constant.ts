export const SUPPORTED_ASSETS = ["BTC", "ETH", "SOL"] as const;
export type Asset = (typeof SUPPORTED_ASSETS)[number];
export const WSS_PORT = Number(process.env.WSS_PORT)|| 8080 as number;
export const brokerUrl = process.env.KAFKA_BROKER || "localhost:9092";
export const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6380";

// Intercept stderr to suppress specific warnings
const originalStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = (chunk: any, ...args: any[]) => {
  const message = chunk.toString();

  if (
    message.includes('TimeoutNegativeWarning') ||
    message.includes('is a negative number') ||
    message.includes('Timeout duration was set to 1') ||
    message.includes('There is no leader for this topic-partition as we are in the middle of a leadership election')
  ) {
    return true; // Suppress
  }

  return originalStderrWrite(chunk, ...args);
}