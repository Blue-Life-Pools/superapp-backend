CREATE TABLE "AppUser" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppUser_email_key" ON "AppUser"("email");
CREATE INDEX "AppUser_role_active_idx" ON "AppUser"("role", "active");
CREATE UNIQUE INDEX "AppSession_tokenHash_key" ON "AppSession"("tokenHash");
CREATE INDEX "AppSession_userId_expiresAt_idx" ON "AppSession"("userId", "expiresAt");

ALTER TABLE "AppSession"
ADD CONSTRAINT "AppSession_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "AppUser"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "AppUser" (
    "id", "name", "email", "passwordHash", "role", "active", "createdAt", "updatedAt"
)
SELECT
    "id", "name", LOWER("email"), "passwordHash", 'CHEMICALS', "active", "createdAt", CURRENT_TIMESTAMP
FROM "ChemicalOwner"
ON CONFLICT ("email") DO UPDATE SET
    "name" = EXCLUDED."name",
    "passwordHash" = EXCLUDED."passwordHash",
    "role" = 'CHEMICALS',
    "active" = EXCLUDED."active",
    "updatedAt" = CURRENT_TIMESTAMP;
