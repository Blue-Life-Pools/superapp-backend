CREATE TABLE "ChemicalTechnician" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "whatsappNumber" TEXT NOT NULL,
    "shareToken" UUID NOT NULL DEFAULT gen_random_uuid(),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChemicalTechnician_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChemicalTechnician_name_key"
ON "ChemicalTechnician"("name");

CREATE UNIQUE INDEX "ChemicalTechnician_whatsappNumber_key"
ON "ChemicalTechnician"("whatsappNumber");

CREATE UNIQUE INDEX "ChemicalTechnician_shareToken_key"
ON "ChemicalTechnician"("shareToken");
