// Read-only coverage check. Run `npx nest build` before this script.
require('dotenv').config({ quiet: true });
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { ChemicalConsumptionService } = require('../dist/chemicals/chemical-consumption.service');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 }) });
async function main() {
  const month = process.argv[2] || '2026-10';
  const result = await new ChemicalConsumptionService(prisma).list(month);
  const chemicals = result.periods.flatMap((period) => period.chemicals);
  const overages = result.periods.filter((period) => period.chemicals.some((chemical) => chemical.status === 'HIGH'));
  console.log(JSON.stringify({ month, crmProperties: result.properties.length, ...result.history, recordedPeriods: result.periods.length, evaluableChemicals: chemicals.filter((chemical) => chemical.expectedMax !== null).length, quantityOverages: chemicals.filter((chemical) => chemical.status === 'HIGH').length, propertiesWithOverages: overages.length }));
}
main().catch((error) => { console.error(error.code || error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
