// Local customer input is read from the supplied path and must never be committed.
require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const ts = require('typescript');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const filename = path.resolve(__dirname, '../src/opportunities/opportunity-data.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const loaded = { exports: {} }; new Function('exports', 'require', 'module', compiled)(loaded.exports, createRequire(filename), loaded);
const { parseOpportunityCsv, buildPropertyMatches } = loaded.exports;
let prisma;
async function main() {
  const input = process.argv[2];
  if (!input || input.startsWith('--')) throw new Error('Supply a CSV path; add --check-database or --apply when ready.');
  const bytes = fs.readFileSync(input), rows = parseOpportunityCsv(bytes, path.basename(input));
  const report = { applied: false, rows: rows.length, sourceSha256: crypto.createHash('sha256').update(bytes).digest('hex'), uniqueSourceIds: new Set(rows.map(row => row.sourceRecordId)).size, statuses: {}, missingEstimateNumbers: rows.filter(row => !row.estimateNumber).length, missingCreationDates: rows.filter(row => !row.creationDate).length };
  for (const row of rows) { const status = row.status || 'Not recorded'; report.statuses[status] = (report.statuses[status] || 0) + 1; }
  if (process.argv.includes('--check-database') || process.argv.includes('--apply')) {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 }) });
    const plan = await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const [{ table }] = await tx.$queryRawUnsafe(`SELECT to_regclass('public."Opportunity"')::text AS "table"`);
      const properties = await tx.property.findMany({ where: { deletedAt: null }, select: { id: true, name: true } });
      const existing = table ? await tx.opportunity.findMany({ where: { source: 'CSV', sourceRecordId: { in: rows.map(row => row.sourceRecordId) } }, select: { sourceRecordId: true } }) : [];
      const migrations = await tx.$queryRawUnsafe('SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at DESC LIMIT 5');
      return { tableExists: Boolean(table), properties, existing, migrations };
    }, { timeout: 30000 });
    const match = buildPropertyMatches(plan.properties), data = rows.map(row => ({ ...row, propertyId: match([row.propertyName, row.linkedPropertyName]) }));
    Object.assign(report, { tableExists: plan.tableExists, alreadyLoaded: plan.existing.length, newRows: rows.length - plan.existing.length, matchedProperties: data.filter(row => row.propertyId).length, latestMigrations: plan.migrations.map(row => ({ name: row.migration_name, complete: Boolean(row.finished_at), rolledBack: Boolean(row.rolled_back_at) })) });
    if (process.argv.includes('--apply')) {
      if (!plan.tableExists) throw new Error('The Opportunities migration must be applied before importing.');
      if (plan.migrations.some(row => !row.finished_at && !row.rolled_back_at)) throw new Error('Resolve the failed migration before importing.');
      const inserted = await prisma.$transaction(async tx => {
        let count = 0;
        for (let index = 0; index < data.length; index += 200) count += (await tx.opportunity.createMany({ data: data.slice(index, index + 200), skipDuplicates: true })).count;
        return count;
      }, { timeout: 90000 });
      Object.assign(report, { applied: true, inserted, skipped: rows.length - inserted, storedTotal: await prisma.opportunity.count({ where: { deletedAt: null } }) });
    }
  }
  console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { console.error(error.code ? `Database operation failed (${error.code}).` : error.message); process.exitCode = 1; }).finally(async () => { if (prisma) await prisma.$disconnect(); });
