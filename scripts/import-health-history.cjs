const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const csvPath = process.argv[2] || 'C:\\Users\\Xime\\Downloads\\Health Department..csv';
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i], next = text[i + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; i += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === ',' && !quoted) { row.push(cell.trim()); cell = ''; continue; }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell.trim()); cell = '';
      if (row.some(Boolean)) rows.push(row);
      row = [];
      continue;
    }
    cell += char;
  }
  if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
  const headers = rows.shift().map((header) => header.replace(/^\uFEFF/, ''));
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])));
}

function dateValue(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function main() {
  const rows = parseCsv(fs.readFileSync(path.resolve(csvPath), 'utf8'));
  await prisma.healthTicket.deleteMany({});
  for (const [index, row] of rows.entries()) {
    const status = row['Estatus'] === 'Done' ? 'CLOSED' : row['Estatus'] === 'In Progress' ? 'IN_PROGRESS' : 'NEW';
    const estimateStatus = row['Estado Estimado'] === 'Aprobado' ? 'APPROVED' : row['Estimado'] ? 'REQUIRED' : 'PENDING';
    await prisma.healthTicket.create({ data: {
      ticketNumber: `HD-HIST-${String(index + 1).padStart(4, '0')}`,
      outlookMessageId: `history-${index + 1}`,
      subject: row['Violaciones'] || `Health Department visit - ${row['Propiedad']}`,
      propertyName: row['Propiedad'] || null,
      receivedAt: dateValue(row['Fecha de Inicio']) || new Date(),
      visitDate: dateValue(row['Fecha Límite']),
      status,
      estimateStatus,
      estimateNumber: row['Estimado'] || null,
      bodyPreview: row['Violaciones'] || null,
      healthData: row,
    }});
  }
  console.log(`Imported ${rows.length} Health Department historical tickets from ${csvPath}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
