ALTER TABLE "ReportIncident"
ADD COLUMN "requiresEstimate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "estimateNumber" TEXT;
