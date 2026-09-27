ALTER TABLE "SalesActivity"
ADD COLUMN "rejectedAt" TIMESTAMP(3);

UPDATE "SalesActivity"
SET "rejectedAt" = COALESCE("approvedAt", "occurredAt"),
    "approvedAt" = NULL
WHERE "status" = 'REJECTED';
