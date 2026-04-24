import type { WebSocket as WSWebSocket } from 'ws';
import type { extendedWebSocket } from './interfaces';
import { SUPPORTED_ASSETS } from './constant';
import type { Asset } from './constant';
import { requireAuth } from './utils';
export const SUBSCRIPTION_MANAGER = new Map<Asset, Set<WSWebSocket>>(); // assetName -> Set of WebSockets eg:- BTC -> WSS LIST
export const USER_WS_MAP = new Map<string, Set<WSWebSocket>>(); // userId -> Set of WebSockets

export const addSubscriber = (assetName: Asset, ws: WSWebSocket) => {
    if (!SUBSCRIPTION_MANAGER.has(assetName)) {
        SUBSCRIPTION_MANAGER.set(assetName, new Set());
    }
    SUBSCRIPTION_MANAGER.get(assetName)?.add(ws);
};

export const removeSubscriber = (assetName: Asset, ws: WSWebSocket) => {
    SUBSCRIPTION_MANAGER.get(assetName)?.delete(ws);
};

export const handleSubscribe = (asset: Asset, ws: extendedWebSocket) => {
    if (!requireAuth(ws)) return;
    if (!SUPPORTED_ASSETS.includes(asset)) {
        ws.send(
            JSON.stringify({
                action: "SUBSCRIBE",
                result: "failure",
                reason: "Unsupported asset",
            }),
        );
        return;
    }
    addSubscriber(asset, ws);
    ws.send(
        JSON.stringify({
            action: "SUBSCRIBE",
            result: "success",
            asset,
        }),
    );
}

export const handleUnsubscribe = (asset: Asset, ws: extendedWebSocket) => {
    if (!requireAuth(ws)) return;
    if (!SUPPORTED_ASSETS.includes(asset)) {
        ws.send(
            JSON.stringify({
                action: "UNSUBSCRIBE",
                result: "failure",
                reason: "Unsupported asset",
            }),
        );
        return;
    }
    removeSubscriber(asset, ws);
    ws.send(
        JSON.stringify({
            action: "UNSUBSCRIBE",
            result: "success",
            asset,
        }),
    );
}


export const removeUser = (userId: string) => {
    const userSockets = USER_WS_MAP.get(userId);
    if (userSockets) {
        userSockets.forEach((ws) => {
            // Remove from all asset subscriptions
            SUBSCRIPTION_MANAGER.forEach((sockets, asset) => {
                if (sockets.has(ws)) {
                    sockets.delete(ws);
                }
            });
            ws.close();
        });
        USER_WS_MAP.delete(userId);
        console.log(`user ${userId} Removed and all associated WebSocket connections closed`);
    }
}