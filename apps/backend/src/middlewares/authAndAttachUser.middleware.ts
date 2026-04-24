import type { Request, Response, NextFunction } from "express";
import jwt, { TokenExpiredError, JsonWebTokenError } from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";
import type { VerifyOptions } from "jsonwebtoken";
import { JWT_SECRET } from "../constants/envConstants";
import { getUserById } from "../data/store";

interface AuthenticatedRequest extends Request {
  user?: any;
}

interface AuthTokenPayload extends JwtPayload {
  id: string;
  email: string;
}

export const authAndAttachUser = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  const excludedPaths = [
    "/api/merchant/createPaymentIntent",
    "/api/blockchains/receive_quicknode_events",
  ];

  if (excludedPaths.includes(req.originalUrl)) {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authorization header missing" });
  }

  const token = authHeader.split(" ")[1];

  let decoded: unknown;

  try {
    if (!JWT_SECRET) {
      throw new Error("JWT_SECRET is not defined");
    }
      const options: VerifyOptions = {
      algorithms: ["HS256"],
      issuer: "my_app",
    };
    
    decoded = jwt.verify(token!, JWT_SECRET!, options);
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      return res.status(401).json({ message: "Token expired" });
    }
    if (err instanceof JsonWebTokenError) {
      return res.status(401).json({ message: "Invalid token" });
    }
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (typeof decoded !== "object" || decoded === null) {
    return res.status(401).json({ message: "Invalid token payload" });
  }

  const payload = decoded as AuthTokenPayload;

  const user = getUserById(payload.userId);

  if (!user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  req.user = user;
  next();
};
