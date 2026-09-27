-- CreateTable
CREATE TABLE "ManagementCompany" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagementCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "leadSource" TEXT,
    "propertyType" TEXT,
    "segment" TEXT,
    "commercialStage" TEXT,
    "addressLine1" TEXT,
    "city" TEXT,
    "county" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "formattedAddress" TEXT,
    "latitude" DECIMAL(65,30),
    "longitude" DECIMAL(65,30),
    "managementCompanyId" TEXT,
    "sharepointFolderId" TEXT,
    "sharepointFolderUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "managementCompanyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyContact" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "role" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PropertyContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaterBody" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaterBody_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesActivity" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ManagementCompany_name_key" ON "ManagementCompany"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Property_code_key" ON "Property"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyContact_propertyId_contactId_role_key" ON "PropertyContact"("propertyId", "contactId", "role");

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_managementCompanyId_fkey" FOREIGN KEY ("managementCompanyId") REFERENCES "ManagementCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_managementCompanyId_fkey" FOREIGN KEY ("managementCompanyId") REFERENCES "ManagementCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyContact" ADD CONSTRAINT "PropertyContact_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyContact" ADD CONSTRAINT "PropertyContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaterBody" ADD CONSTRAINT "WaterBody_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesActivity" ADD CONSTRAINT "SalesActivity_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
