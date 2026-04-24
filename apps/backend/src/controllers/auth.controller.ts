import type { Request, Response } from "express";
import type { PayLoad } from "../constants/types";
import jwt from "jsonwebtoken";
import { v5 as uuidv5 } from "uuid";
import type { SignOptions } from "jsonwebtoken";
import { JWT_SECRET, JWT_EXPIRES_IN } from "../constants/envConstants";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/apiError";
import { ApiResponse } from "../utils/apiResponse";
import { dao } from "database";
import { logger } from "../utils/logger";
import { mapEmailToUserId, storeUserInMap, getUserIdByEmail, getUserById } from "../data/store";
const UUID_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

export const signUp = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  try {
    const exists = await dao.user.getUserByEmail(email);
    if (exists) {
      throw new ApiError("email already exists", 400);
    }

    const userId = uuidv5(email, UUID_NAMESPACE);
    const newUser = await dao.user.createUser(email,userId,password);

    const options: SignOptions = {
      algorithm: "HS256",
      expiresIn: JWT_EXPIRES_IN as any,
      issuer: "my_app",
    };

    const payload: PayLoad = {
      userId: newUser.userId,
      email: newUser.email,
    };

    const token = jwt.sign(payload, JWT_SECRET, options);

    storeUserInMap(newUser.userId, newUser.email, newUser.password, newUser.balanceCents);
    mapEmailToUserId(newUser.email, newUser.userId);

    return new ApiResponse(201, {
      message: "User created 🚀",
      token,
    });
  } catch (error) {
    logger.error("Error creating user:", error);
    throw new ApiError("Internal Server Error", 500);
  }
});

export const signIn = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    throw new ApiError("email and password are required", 400);
  }

  const userId = getUserIdByEmail(email);
  const user = getUserById(String(userId));
  if (!user) {
    throw new ApiError("email or password is incorrect", 400);
  }

  if (user.password !== password) {
    throw new ApiError("email or password is incorrect", 400);
  }

    const payload: PayLoad = {
      userId: user.userId,
      email: user.email,
    };

  const options: SignOptions = {
    algorithm: "HS256",
    expiresIn: JWT_EXPIRES_IN as any,
    issuer: "my_app",
  };

  const token = jwt.sign(payload, JWT_SECRET, options);

  return new ApiResponse(200, {
    message: "User signed in successfully 🚀",
    token,
  });
});
