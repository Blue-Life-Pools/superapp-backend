CREATE TABLE "ProposalFollowUp" (
    "id" TEXT NOT NULL,
    "salesActivityId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'EMAIL',

    CONSTRAINT "ProposalFollowUp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProposalFollowUp_salesActivityId_occurredAt_idx"
ON "ProposalFollowUp"("salesActivityId", "occurredAt");

ALTER TABLE "ProposalFollowUp"
ADD CONSTRAINT "ProposalFollowUp_salesActivityId_fkey"
FOREIGN KEY ("salesActivityId") REFERENCES "SalesActivity"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
