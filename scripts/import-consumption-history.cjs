// Load local customer data into the CRM database; never commit input files.
require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 }) });
async function main() {
  if (!process.argv[2]) throw new Error('Supply a local archive JSON path; add --apply to import.');
  const archive = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  if (archive.year !== 2025 || !Array.isArray(archive.properties) || !Array.isArray(archive.factors)) throw new Error('Invalid archive.');
  const codes = new Set();
  for (const p of archive.properties) {
    if (!p.code || !p.name || codes.has(p.code) || !Array.isArray(p.chemicals)) throw new Error('Invalid or duplicate property.');
    codes.add(p.code);
    for (const chemical of p.chemicals) {
      if (!chemical.name || !chemical.unit || !Array.isArray(chemical.months) || new Set(chemical.months.map((m) => m[0])).size !== chemical.months.length) throw new Error('Invalid chemical history.');
      for (const m of chemical.months) if (m.length !== 4 || !Number.isInteger(m[0]) || m[0] < 1 || m[0] > 12 || !Number.isFinite(m[1]) || m[1] < 0 || !Number.isFinite(m[2]) || m[2] < 0 || typeof m[3] !== 'boolean') throw new Error('Invalid observation.');
    }
  }
  for (const f of archive.factors) if (!f.chemical || !f.unit || !Number.isInteger(f.month) || f.month < 1 || f.month > 12 || !Number.isFinite(f.factor) || f.factor <= 0) throw new Error('Invalid factor.');
  if (!process.argv.includes('--apply')) { console.log(JSON.stringify({ validatedProperties: archive.properties.length, applied: false })); return; }
  const result = await prisma.chemicalConsumptionHistory.createMany({ data: archive.properties.map((p) => ({ sourceYear: archive.year, code: p.code, name: p.name, chemicals: p.chemicals, factors: archive.factors })), skipDuplicates: true });
  console.log(JSON.stringify({ importedProperties: result.count, preservedExisting: archive.properties.length - result.count }));
}
main().catch((error) => { console.error(error.code || error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
