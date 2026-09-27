ALTER TABLE "ChemicalReport" DROP CONSTRAINT IF EXISTS "ChemicalReport_waterBodyId_fkey";
ALTER TABLE "ChemicalReport" DROP CONSTRAINT IF EXISTS "ChemicalReport_propertyId_fkey";
DROP INDEX IF EXISTS "ChemicalReport_propertyId_serviceDate_idx";
ALTER TABLE "ChemicalReport" DROP COLUMN IF EXISTS "waterBodyId";
ALTER TABLE "ChemicalReport" DROP COLUMN IF EXISTS "waterBodyName";
ALTER TABLE "ChemicalReport" DROP COLUMN IF EXISTS "propertyId";
ALTER TABLE "ChemicalReport" DROP COLUMN IF EXISTS "propertyName";
