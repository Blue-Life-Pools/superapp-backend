ALTER TABLE "Property" ADD COLUMN "quickbooksCustomerId" TEXT;

CREATE TABLE "QuickBooksEstimate" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "quickbooksEstimateId" TEXT NOT NULL,
    "estimateNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "estimateDate" TIMESTAMP(3),
    "totalAmount" DECIMAL(14,2),
    "subtotalAmount" DECIMAL(14,2),
    "taxAmount" DECIMAL(14,2),
    "customerMemo" TEXT,
    "billEmail" TEXT,
    "quickbooksUpdatedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "syncSource" TEXT NOT NULL DEFAULT 'QUICKBOOKS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QuickBooksEstimate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuickBooksEstimateLine" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "itemRefId" TEXT,
    "itemName" TEXT,
    "description" TEXT,
    "quantity" DECIMAL(14,4),
    "unitPrice" DECIMAL(14,2),
    "amount" DECIMAL(14,2),
    "taxCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QuickBooksEstimateLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuickBooksEstimate_quickbooksEstimateId_key" ON "QuickBooksEstimate"("quickbooksEstimateId");
CREATE UNIQUE INDEX "QuickBooksEstimate_propertyId_estimateNumber_key" ON "QuickBooksEstimate"("propertyId", "estimateNumber");
CREATE INDEX "QuickBooksEstimate_propertyId_status_idx" ON "QuickBooksEstimate"("propertyId", "status");
CREATE UNIQUE INDEX "QuickBooksEstimateLine_estimateId_lineNumber_key" ON "QuickBooksEstimateLine"("estimateId", "lineNumber");
CREATE INDEX "QuickBooksEstimateLine_estimateId_idx" ON "QuickBooksEstimateLine"("estimateId");

ALTER TABLE "QuickBooksEstimate" ADD CONSTRAINT "QuickBooksEstimate_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuickBooksEstimateLine" ADD CONSTRAINT "QuickBooksEstimateLine_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "QuickBooksEstimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
