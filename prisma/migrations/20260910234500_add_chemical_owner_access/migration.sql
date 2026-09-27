ALTER TABLE "ChemicalReport"
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deletedByEmail" TEXT;

CREATE TABLE "ChemicalOwner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChemicalOwner_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChemicalOwnerSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChemicalOwnerSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChemicalOwner_email_key" ON "ChemicalOwner"("email");
CREATE UNIQUE INDEX "ChemicalOwnerSession_tokenHash_key" ON "ChemicalOwnerSession"("tokenHash");
CREATE INDEX "ChemicalOwnerSession_ownerId_expiresAt_idx" ON "ChemicalOwnerSession"("ownerId", "expiresAt");

ALTER TABLE "ChemicalOwnerSession"
ADD CONSTRAINT "ChemicalOwnerSession_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "ChemicalOwner"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ChemicalOwner" (
    "id",
    "name",
    "email",
    "passwordHash",
    "active",
    "createdAt",
    "updatedAt"
) VALUES (
    '65c4cb9f-3c06-4bcf-a6a4-a78f72bbd06c',
    'Ximena',
    'ximenam@bluelifepools.com',
    'scrypt$8c124f8531a31d37f225e1433b274bad$f40e407201baf31a48902796d02e0ac4b8fc875936b20f3df8b11143c628f167e71d4317145e9d0050f9ea0945d3878ba093542cdba548e04dd2770919595e53',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);
