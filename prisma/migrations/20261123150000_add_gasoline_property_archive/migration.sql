CREATE TABLE "GasolinePropertyArchive" (
    "month" TEXT NOT NULL,
    "propertyCount" INTEGER NOT NULL,
    "properties" JSONB NOT NULL,

    CONSTRAINT "GasolinePropertyArchive_pkey" PRIMARY KEY ("month")
);
