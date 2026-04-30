// making a websocket server using ws library
import { WebSocketServer } from "ws";
import type { RawData } from "ws";
import { initRedisSubscriptions, unSubscribeRedisChannelsAndClose } from './redis';
import type { extendedWebSocket } from './interfaces';
import { handleRawMessage } from './utils';
import { routeMessage } from './router';
import { removeUser } from './subscriptionManager';
import { WSS_PORT } from "./constant";
const wss = new WebSocketServer({ port: WSS_PORT });
let shuttingDown = false;
export const startServer = () => {
  initRedisSubscriptions();
  console.log("[1/2] Redis initialized and subscribed to price channels");
    wss.on('listening', () => {
    console.log("[2/2] WSS started successfully on ws://localhost:" + WSS_PORT);
  });

  wss.on('connection', (ws: extendedWebSocket) => {
    console.log('Client connected');
    ws.isAuthenticated = false; 

    ws.on('message', (message: RawData) => {
      const parsedMessage = handleRawMessage(message);
      if (!parsedMessage) {
        ws.send(
          JSON.stringify({
            action: "AUTH",
            result: "failure",
            reason: "Invalid message format",
          }),
        );
        return;
      }
      routeMessage(parsedMessage, ws);
    });

    ws.on('close', () => {
      console.log('Client disconnected');
      if (ws.userId) {
        removeUser(ws.userId);
      }
    });
  });
}

startServer();






process.on('SIGINT', async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  await unSubscribeRedisChannelsAndClose(); // all redis connections closed here
  console.log("[1/2] Unsubscribed from all Redis channels and closed connections");
  wss.close(() => {
    console.log('[2/2] WebSocket server closed');
    process.exit(0);
  });
});