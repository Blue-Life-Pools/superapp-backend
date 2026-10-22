ALTER TABLE "Property" ADD COLUMN "chemicalFollowUpResolvedAt" TIMESTAMP(3);
ALTER TABLE "Property" ADD COLUMN "chemicalFollowUpResolvedById" TEXT;
ALTER TABLE "Property" ADD COLUMN "chemicalFollowUpResolution" TEXT;
CREATE INDEX "Property_chemicalFollowUpResolvedAt_idx" ON "Property"("chemicalFollowUpResolvedAt");
ALTER TABLE "Property" ADD CONSTRAINT "Property_chemicalFollowUpResolvedById_fkey" FOREIGN KEY ("chemicalFollowUpResolvedById") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
