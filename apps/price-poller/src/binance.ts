import WebSocket from "ws";
import { EventEmitter } from "events";
import { BINANCE_STREAMS } from "./constants";
import type { Trades } from "./types";
import { toInternalPrice } from "./utils";

let socket: WebSocket | null = null;
export const binanceEmitter = new EventEmitter();
export const startBinancePricePoller = () => {
  const wsUrl = "wss://stream.binance.com:9443/ws";

  socket = new WebSocket(wsUrl);

  socket.on("open", () => {
    console.log("✅ Binance WebSocket connected");
    const stream = {
      method: "SUBSCRIBE",
      params: Object.values(BINANCE_STREAMS),
      id: 1,
    };
    socket?.send(JSON.stringify(stream));
  });

  socket.on("message", (data: Buffer) => {
    try {
      //Buffer :Temporary storage of raw binary data
      const ws_msg = JSON.parse(data.toString());
      if (ws_msg.e !== "aggTrade") return;
      if (ws_msg.e === "aggTrade") {
        let liveTrades: Trades = {
          tradeId: ws_msg.a,
          symbol: ws_msg.s,
          price: toInternalPrice(ws_msg.p),
          quantity: ws_msg.q,
          timestamp: ws_msg.T,
        };
        // console.log("Received trade data >>>>", ws_msg);
        binanceEmitter.emit("trade", liveTrades);
      }
      // const price = parseFloat(trade.p);
      // onPriceUpdate(price);
    } catch (error) {
      console.error("Error parsing Binance message:", error);
    }
  });

  socket.on("error", (error) => {
    console.error("Binance WebSocket error:", error);
  });

  socket.on("close", (code, reason) => {
    console.warn(
      `⚠️ Binance WebSocket closed. Code: ${code}, Reason: ${reason.toString()}`,
    );
  });

  return socket;
};

export const stopBinancePricePoller = () => {
  if (!socket) return;
  socket.close(1000, "Manual shutdown"); // 1000 = Normal closure
  socket = null;
  binanceEmitter.removeAllListeners("trade");
};
