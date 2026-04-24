import jwt, { TokenExpiredError, JsonWebTokenError } from "jsonwebtoken";
import type { VerifyOptions } from "jsonwebtoken";
import type { extendedWebSocket } from "./interfaces";
import { USER_WS_MAP } from "./subscriptionManager";

export const handleVerifyToken = (token: string, ws: extendedWebSocket) => {
  try {
    if (!token) {
      ws.send(
        JSON.stringify({
          action: "AUTH",
          result: "failure",
          reason: "Token is missing",
        }),
      );
      return;
    }
    const tokenSecret = process.env.JWT_SECRET;
    if (!tokenSecret) {
      throw new Error("JWT_SECRET is not defined");
    }
    const options: VerifyOptions = {
      algorithms: ["HS256"],
      issuer: "my_app",
    };
    const decoded = jwt.verify(token, tokenSecret, options);
    console.log("Decoded token:", decoded);
    if (
      typeof decoded === "object" &&
      decoded !== null &&
      "userId" in decoded &&
      typeof decoded.userId === "string"
    ) {
      ws.userId = decoded.userId;
      ws.isAuthenticated = true;
      if (!USER_WS_MAP.has(ws.userId)) {
        USER_WS_MAP.set(ws.userId, new Set());
      }
      USER_WS_MAP.get(ws.userId)?.add(ws);
      ws.send(
        JSON.stringify({
          action: "AUTH",
          result: "success",
        }),
      );
      return;
    }
    ws.send(
      JSON.stringify({
        action: "AUTH",
        result: "failure",
        reason: "Invalid token payload",
      }),
    );
  } catch (err) {
    if (err instanceof TokenExpiredError || err instanceof JsonWebTokenError) {
      ws.send(
        JSON.stringify({
          action: "AUTH",
          result: "failure",
          reason: "Invalid token",
        }),
      );
    } else {
      ws.send(
        JSON.stringify({
          action: "AUTH",
          result: "failure",
          reason: "Unauthorized",
        }),
      );
    }
  }
};
