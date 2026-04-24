import { Router } from "express";

const mainRouter = Router();

import authRouter from "./auth.route";
import { tradeRouter } from "./trade.route";
import {spotRouter } from "./spot.route";

mainRouter.use("/auth", authRouter);
mainRouter.use("/trade", tradeRouter);
mainRouter.use("/spot", spotRouter);

export default mainRouter;