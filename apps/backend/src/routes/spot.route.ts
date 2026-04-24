import { Router } from "express";
import { createSpotOrder, getUserSpotHoldings, createLimitOrder } from "../controllers/spot.controller";
import { authAndAttachUser } from "../middlewares/authAndAttachUser.middleware";
export const spotRouter = Router();

spotRouter.post("/order", authAndAttachUser, createSpotOrder);
spotRouter.get("/holdings", authAndAttachUser, getUserSpotHoldings);
spotRouter.post("/order/limit", authAndAttachUser, createLimitOrder);