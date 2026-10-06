require('dotenv/config');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const allPath = process.argv[2] || 'C:/Users/Xime/Downloads/PROPIEDADES (3).csv';
const activePath = process.argv[3] || 'C:/Users/Xime/Downloads/PROPIEDADES MANTENIMIENTO REGULAR (5).csv';
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

function readCsv(filePath) {
  return parse(fs.readFileSync(path.resolve(filePath), 'utf8'), { columns: true, skip_empty_lines: true, bom: true, relax_column_count: true });
}
function value(row, key) { return String(row[key] ?? '').trim(); }
function propertyType(valueToMap) { return valueToMap.toUpperCase().includes('COMERCIAL') ? 'COMMERCIAL' : 'RESIDENTIAL'; }
function segment(valueToMap) { return valueToMap.toUpperCase().includes('MULTIFAMILIAR') ? 'MULTIFAMILY' : 'SINGLE_FAMILY'; }
function cleanEmail(valueToMap) { const email = valueToMap.split(',')[0].trim().toLowerCase(); return email.includes('@') ? email : null; }
function waterBodies(row) {
  const source = value(row, 'Cuerpos de Agua');
  const counts = [
    ['Piscina', 'SWIMMING_POOL'],
    ['Spa', 'SPA'],
    ['Fuente', 'DECORATIVE_WATER_FEATURE'],
  ];
  return counts.flatMap(([label, type]) => {
    const match = source.match(new RegExp(`(\\d+)\\s+${label}`, 'i'));
    const count = match ? Number(match[1]) : 0;
    return Array.from({ length: count }, (_, index) => ({ name: count === 1 ? label : `${label} ${index + 1}`, type }));
  });
}

async function main() {
  const allRows = readCsv(allPath).filter((row) => value(row, 'Title') && value(row, 'SKU'));
  const activeRows = readCsv(activePath).filter((row) => value(row, 'Propiedades') && value(row, 'SKU'));
  const activeSkus = new Set(activeRows.map((row) => value(row, 'SKU')));
  const existing = await prisma.property.findMany({ select: { id: true, code: true, name: true, addressLine1: true, city: true, state: true, zipCode: true } });
  const byCode = new Map(existing.filter((row) => row.code).map((row) => [row.code, row]));
  const managementCompanies = new Map();
  for (const name of new Set(allRows.map((row) => value(row, 'Managment')).filter((name) => name && name.toLowerCase() !== 'no aplica'))) {
    const company = await prisma.managementCompany.upsert({ where: { name }, update: {}, create: { name } });
    managementCompanies.set(name, company.id);
  }
  let created = 0; let updated = 0; let active = 0; let inactive = 0; let waterBodiesCreated = 0;

  async function importRow(row, index) {
    const sku = value(row, 'SKU');
    const name = value(row, 'Title');
    const isActive = activeSkus.has(sku);
    const managementCompanyName = value(row, 'Managment');
    const maintenanceChief = [value(row, 'Jefe Mantenimiento'), value(row, 'Cel Jefe Mantenimiento')].filter(Boolean).join(' - ');
    const managementCompanyId = managementCompanies.get(managementCompanyName);
    const data = {
      code: sku,
      name,
      propertyType: propertyType(value(row, 'Tipo de propiedad')),
      segment: segment(value(row, 'Segmento')),
      addressLine1: value(row, 'Direccion ' ) || null,
      city: value(row, 'Ciudad') || null,
      county: value(row, 'Condado') || null,
      state: value(row, 'State') || null,
      zipCode: value(row, 'ZIP') || null,
      latitude: value(row, 'Latitude') || null,
      longitude: value(row, 'Longitude') || null,
      lifecycleStatus: isActive ? 'CLIENT' : 'INACTIVE',
      deletedAt: null,
      legacySource: path.basename(allPath),
      legacyRow: index + 2,
      maintenanceChiefInfo: maintenanceChief || null,
      regularMaintenanceData: isActive ? { source: path.basename(activePath), sku, name: value(row, 'Title') } : null,
      ...(managementCompanyId ? { managementCompanyId } : {}),
    };
    let property = byCode.get(sku);
    if (!property) {
      property = await prisma.property.create({ data });
      byCode.set(sku, property);
      created += 1;
    } else {
      await prisma.property.update({ where: { id: property.id }, data });
      updated += 1;
    }
    if (isActive) active += 1; else inactive += 1;
    return property;
  }
  for (let start = 0; start < allRows.length; start += 20) {
    await Promise.all(allRows.slice(start, start + 20).map((row, offset) => importRow(row, start + offset)));
  }
  console.log(JSON.stringify({ total: allRows.length, created, updated, active, inactive, waterBodiesCreated }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
