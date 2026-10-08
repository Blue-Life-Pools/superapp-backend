ALTER TABLE "QualityFinding"
ADD COLUMN "responsibleName" TEXT,
ADD COLUMN "resolvedAt" TIMESTAMP(3),
ADD COLUMN "estimateNumber" TEXT,
ADD COLUMN "estimateSentAt" TIMESTAMP(3);
