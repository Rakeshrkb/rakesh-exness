import type { WebSocket as WSWebSocket } from "ws";

export interface extendedWebSocket extends WSWebSocket {
    isAuthenticated?: boolean;
    userId?: string;
}

export interface AuthenticationResult {
    action : "AUTH",
    result: "success" | "failure",
    reason?: string;
}