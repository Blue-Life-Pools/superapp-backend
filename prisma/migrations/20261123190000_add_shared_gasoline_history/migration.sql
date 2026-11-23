CREATE TABLE "GasolinePurchase" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "driver" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "gallons" DOUBLE PRECISION NOT NULL,
    "cents" INTEGER NOT NULL,
    "reportedMiles" DOUBLE PRECISION,
    CONSTRAINT "GasolinePurchase_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GasolinePurchase_date_idx" ON "GasolinePurchase"("date");

CREATE TABLE "GasolineRoute" (
    "id" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "properties" INTEGER,
    "miles" DOUBLE PRECISION,
    CONSTRAINT "GasolineRoute_pkey" PRIMARY KEY ("id")
);
