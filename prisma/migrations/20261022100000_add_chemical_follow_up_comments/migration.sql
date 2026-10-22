CREATE TABLE "ChemicalFollowUpComment" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChemicalFollowUpComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChemicalFollowUpComment_propertyId_occurredAt_idx" ON "ChemicalFollowUpComment"("propertyId", "occurredAt");

ALTER TABLE "ChemicalFollowUpComment" ADD CONSTRAINT "ChemicalFollowUpComment_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChemicalFollowUpComment" ADD CONSTRAINT "ChemicalFollowUpComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
