ALTER TABLE "SalesActivity"
ADD COLUMN "emailDraftId" TEXT,
ADD COLUMN "emailDraftWebUrl" TEXT,
ADD COLUMN "emailDraftCreatedAt" TIMESTAMP(3),
ADD COLUMN "emailDraftFileName" TEXT;
