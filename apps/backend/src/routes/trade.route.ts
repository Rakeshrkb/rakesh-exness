import { Router } from "express";
import { checkOpenOrdersController, openTradeController, addMarginController, closeTradeController } from "../controllers/trade.controller";
import { authAndAttachUser } from "../middlewares/authAndAttachUser.middleware";
export const tradeRouter = Router();

tradeRouter.post("/open", authAndAttachUser, openTradeController);
tradeRouter.get("/check-open-orders", authAndAttachUser, checkOpenOrdersController);
tradeRouter.post("/close", authAndAttachUser, closeTradeController);
tradeRouter.post("/add-margin", authAndAttachUser, addMarginController);