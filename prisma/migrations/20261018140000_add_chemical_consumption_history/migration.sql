CREATE TABLE "ChemicalConsumptionHistory" (
    "id" TEXT NOT NULL,
    "sourceYear" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "chemicals" JSONB NOT NULL,
    "factors" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChemicalConsumptionHistory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChemicalConsumptionHistory_sourceYear_code_key" ON "ChemicalConsumptionHistory"("sourceYear", "code");
