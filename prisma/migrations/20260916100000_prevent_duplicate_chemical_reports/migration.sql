-- Keep the first copy of each fully identical report and hide older duplicates.
WITH ranked_reports AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY
        "serviceDate", LOWER(TRIM("technicianName")),
        "tabsQuantity", "tabsUnit", "liquidChlorineGallons",
        "chlorinePowderScoops", "muriaticAcidGallons", "shockScoops",
        "dePowderBags", "dePowderUnit", "bicarbonateScoops",
        "stabilizerScoops", "stabilizerUnit", "saltBags", "phosphatesOunces",
        COALESCE("notes", '')
      ORDER BY "createdAt" ASC, id ASC
    ) AS report_rank
  FROM "ChemicalReport"
  WHERE "deletedAt" IS NULL
)
UPDATE "ChemicalReport" AS report
SET
  "deletedAt" = CURRENT_TIMESTAMP,
  "deletedByEmail" = 'system-duplicate-cleanup'
FROM ranked_reports
WHERE report.id = ranked_reports.id
  AND ranked_reports.report_rank > 1;

CREATE UNIQUE INDEX "ChemicalReport_active_duplicate_key"
ON "ChemicalReport" (
  "serviceDate", LOWER(TRIM("technicianName")),
  "tabsQuantity", "tabsUnit", "liquidChlorineGallons",
  "chlorinePowderScoops", "muriaticAcidGallons", "shockScoops",
  "dePowderBags", "dePowderUnit", "bicarbonateScoops",
  "stabilizerScoops", "stabilizerUnit", "saltBags", "phosphatesOunces",
  COALESCE("notes", '')
)
WHERE "deletedAt" IS NULL;
