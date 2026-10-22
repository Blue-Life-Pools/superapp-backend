// Dry run by default. Only --apply writes the supplied maximums, never usage.
require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { normalizeConsumptionMaximums, matchConsumptionMaximums } = require('../dist/chemicals/consumption-maximums');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 }) });

async function main() {
  const input = JSON.parse(fs.readFileSync(0, 'utf8').replace(/^\uFEFF/, ''));
  if (!Array.isArray(input) || !input.length) throw new Error('Supply a non-empty maximum worksheet.');
  const rows = normalizeConsumptionMaximums(input);
  const properties = await prisma.property.findMany({ where: { deletedAt: null, lifecycleStatus: { not: 'INACTIVE' } }, select: { id: true, name: true, code: true } });
  const matches = matchConsumptionMaximums(properties, rows);
  const matchedCodes = new Set([...matches.values()].flat().map((row) => row.propertyCode));
  const unmatched = [...new Map(rows.filter((row) => !matchedCodes.has(row.propertyCode)).map((row) => [row.propertyCode, { code: row.propertyCode, name: row.propertyName }])).values()];
  const totals = [...new Set(rows.map((row) => `${row.chemicalName}:${row.unit}`))].map((product) => {
    const selected = [...matches.values()].flat().filter((row) => `${row.chemicalName}:${row.unit}` === product);
    return { product, activeProperties: selected.length, maximum: selected.reduce((sum, row) => sum + row.maximum, 0) };
  });
  let applied = 0;
  if (process.argv.includes('--apply')) {
    // A single atomic, parameterized upsert avoids thousands of network trips.
    const payload = JSON.stringify(rows.map((row) => ({ ...row, id: randomUUID() })));
    applied = await prisma.$executeRaw`
      INSERT INTO "ChemicalConsumptionMaximum"
        ("id", "propertyCode", "propertyName", "chemicalName", "unit", "maximum", "recordedMonths", "excludedMonths", "sourceName", "updatedAt")
      SELECT r."id", r."propertyCode", r."propertyName", r."chemicalName", r."unit", r."maximum", r."recordedMonths", r."excludedMonths", r."sourceName", CURRENT_TIMESTAMP
      FROM jsonb_to_recordset(${payload}::jsonb) AS r("id" text, "propertyCode" text, "propertyName" text, "chemicalName" text, "unit" text, "maximum" double precision, "recordedMonths" integer, "excludedMonths" integer, "sourceName" text)
      ON CONFLICT ("propertyCode", "chemicalName", "unit") DO UPDATE SET
        "propertyName" = EXCLUDED."propertyName", "maximum" = EXCLUDED."maximum",
        "recordedMonths" = EXCLUDED."recordedMonths", "excludedMonths" = EXCLUDED."excludedMonths",
        "sourceName" = EXCLUDED."sourceName", "updatedAt" = CURRENT_TIMESTAMP
    `;
  }
  console.log(JSON.stringify({ inputRows: input.length, normalizedRows: rows.length, aliasRowsMerged: input.length - rows.length, workbookProperties: new Set(rows.map((row) => row.propertyCode)).size, matchedActiveProperties: matches.size, unmatched, totals, applied }, null, 2));
}
main().catch((error) => { console.error(error.code || error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
