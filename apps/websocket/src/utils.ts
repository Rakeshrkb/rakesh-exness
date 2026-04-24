import type { RawData } from "ws";
import type { extendedWebSocket } from './interfaces';

export const handleRawMessage = (message: RawData) => {
  try {
    const parsedMessage = JSON.parse(typeof message === "string" ? message : message.toString());
    return parsedMessage;
  } catch (error) {
    console.error("Failed to parse message");
    return null;
  }
};

export const requireAuth = (ws: extendedWebSocket) => {
    if (!ws.isAuthenticated) {
        ws.send(
            JSON.stringify({
                action: "SUBSCRIBE",
                result: "failure",
                reason: "Not authenticated",
            }),
        );
        return false;
    }
    return true;
}