ALTER TABLE "ChemicalReport"
ADD COLUMN "tabsUnit" TEXT NOT NULL DEFAULT 'units',
ADD COLUMN "dePowderUnit" TEXT NOT NULL DEFAULT 'bags',
ADD COLUMN "stabilizerUnit" TEXT NOT NULL DEFAULT 'scoops';
