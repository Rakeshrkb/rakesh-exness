-- CreateTable
CREATE TABLE "Trade" (
    "id" BIGSERIAL NOT NULL,
    "symbol" TEXT NOT NULL,
    "price" BIGINT NOT NULL,
    "tradeId" BIGINT NOT NULL,
    "timestamp" TIMESTAMPTZ(3) NOT NULL,
    "quantity" DECIMAL(20,8) NOT NULL,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id","timestamp")
);

-- CreateTable
CREATE TABLE "closed_orders" (
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "margin" INTEGER NOT NULL,
    "initialMargin" INTEGER NOT NULL,
    "addedMargin" INTEGER NOT NULL DEFAULT 0,
    "leverage" INTEGER NOT NULL,
    "openPrice" INTEGER NOT NULL,
    "closePrice" INTEGER NOT NULL,
    "liquidationPrice" INTEGER NOT NULL,
    "takeProfit" INTEGER,
    "stopLoss" INTEGER,
    "pnl" INTEGER NOT NULL,
    "closeReason" TEXT NOT NULL,
    "closeMessage" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trailingStopLossEnabled" BOOLEAN NOT NULL DEFAULT false,
    "trailingStopLossDistance" INTEGER,
    "trailingStopLossHighestPrice" INTEGER,
    "trailingStopLossLowestPrice" INTEGER,

    CONSTRAINT "closed_orders_pkey" PRIMARY KEY ("orderId")
);

-- CreateTable
CREATE TABLE "order_snapshots" (
    "id" SERIAL NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "margin" INTEGER NOT NULL,
    "initialMargin" INTEGER NOT NULL,
    "addedMargin" INTEGER NOT NULL DEFAULT 0,
    "leverage" INTEGER NOT NULL,
    "openPrice" INTEGER NOT NULL,
    "liquidationPrice" INTEGER NOT NULL,
    "takeProfit" INTEGER,
    "stopLoss" INTEGER,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trailingStopLossEnabled" BOOLEAN NOT NULL DEFAULT false,
    "trailingStopLossDistance" INTEGER,
    "trailingStopLossHighestPrice" INTEGER,
    "trailingStopLossLowestPrice" INTEGER,

    CONSTRAINT "order_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "active_orders" (
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "margin" INTEGER NOT NULL,
    "initialMargin" INTEGER NOT NULL,
    "addedMargin" INTEGER NOT NULL DEFAULT 0,
    "leverage" INTEGER NOT NULL,
    "openPrice" INTEGER NOT NULL,
    "liquidationPrice" INTEGER NOT NULL,
    "takeProfit" INTEGER,
    "stopLoss" INTEGER,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "trailingStopLossEnabled" BOOLEAN NOT NULL DEFAULT false,
    "trailingStopLossDistance" INTEGER,
    "trailingStopLossHighestPrice" INTEGER,
    "trailingStopLossLowestPrice" INTEGER,

    CONSTRAINT "active_orders_pkey" PRIMARY KEY ("orderId")
);

-- CreateTable
CREATE TABLE "platform_profit" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "totalProfit" INTEGER NOT NULL,
    "openTrades" INTEGER NOT NULL,
    "closedTrades" INTEGER NOT NULL,
    "totalTrades" INTEGER NOT NULL,
    "lastUpdated" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_profit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Trade_symbol_timestamp_idx" ON "Trade"("symbol", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "Trade_tradeId_timestamp_key" ON "Trade"("tradeId", "timestamp");

-- CreateIndex
CREATE INDEX "closed_orders_userId_idx" ON "closed_orders"("userId");

-- CreateIndex
CREATE INDEX "closed_orders_closedAt_idx" ON "closed_orders"("closedAt");

-- CreateIndex
CREATE INDEX "order_snapshots_orderId_snapshotAt_idx" ON "order_snapshots"("orderId", "snapshotAt");

-- CreateIndex
CREATE INDEX "active_orders_userId_idx" ON "active_orders"("userId");
