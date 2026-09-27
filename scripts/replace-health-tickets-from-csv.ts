import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { parse } from 'csv-parse/sync';

type CsvRow = Record<string, string | undefined>;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not configured.');

const args = process.argv.slice(2);
const applyChanges = args.includes('--apply');
const csvArgument = args.find((argument) => argument !== '--apply');
if (!csvArgument) {
  throw new Error(
    'Usage: npx tsx scripts/replace-health-tickets-from-csv.ts <health.csv> [--apply]',
  );
}

const csvPath = path.resolve(csvArgument);
const rows: CsvRow[] = parse(fs.readFileSync(csvPath), {
  bom: true,
  columns: true,
  relax_column_count: true,
  skip_empty_lines: true,
  trim: true,
});

const requiredColumns = [
  'Estatus', 'Fecha de Inicio', 'Propiedad', 'Estado', 'Estado Final',
  'Fecha Límite', 'Estimado', 'Estado Estimado', 'Violaciones', 'Quimico',
  'Feeders', 'Main drain', 'Flow meter /  Flow rate', 'Life Hook, safety line',
  'Gauges, gutters, Plugs', 'Rules / Water level', 'Step / Handrail', 'Otros',
  'Enviado',
];
const columns = Object.keys(rows[0] ?? {});
const missingColumns = requiredColumns.filter((column) => !columns.includes(column));
if (missingColumns.length) {
  throw new Error(`Missing CSV columns: ${missingColumns.join(', ')}`);
}

function value(row: CsvRow, column: string) {
  return row[column]?.trim() ?? '';
}

function usDate(input: string): Date | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(input.trim());
  if (!match) return null;
  const iso = `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  const date = new Date(`${iso}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso
    ? null
    : date;
}

const importedAt = new Date('2026-09-24T00:00:00.000Z');
const tickets: Prisma.HealthTicketCreateManyInput[] = rows.map((row, index) => {
  const sequence = String(index + 1).padStart(4, '0');
  const propertyName = value(row, 'Propiedad');
  const visitDate = usDate(value(row, 'Fecha de Inicio'));
  const statusValue = value(row, 'Estatus');
  const estimateNumber = value(row, 'Estimado');
  const healthData = Object.fromEntries(
    requiredColumns.map((column) => [column, value(row, column)]),
  );
  return {
    ticketNumber: `HD-CSV-20260924-${sequence}`,
    outlookMessageId: `csv-health-20260924-${sequence}`,
    subject: `Health Department inspection - ${propertyName || 'Property not assigned'}`,
    propertyName: propertyName || null,
    senderEmail: 'Historical CSV import',
    receivedAt: visitDate ?? importedAt,
    visitDate,
    status: statusValue === 'Done' ? 'CLOSED' : statusValue === 'In Progress' ? 'IN_PROGRESS' : 'NEW',
    estimateStatus: estimateNumber ? 'REQUIRED' : 'NOT_REQUIRED',
    estimateNumber: estimateNumber || null,
    bodyPreview: value(row, 'Violaciones') || value(row, 'Otros') || null,
    healthData,
  };
});

const statusCounts = tickets.reduce<Record<string, number>>((counts, ticket) => {
  const status = ticket.status ?? 'NEW';
  counts[status] = (counts[status] ?? 0) + 1;
  return counts;
}, {});
console.log(JSON.stringify({ csv: csvPath, rows: rows.length, statusCounts }, null, 2));

if (!applyChanges) {
  console.log('Dry run only. Add --apply to replace the Health Department tickets.');
} else {
  void replaceTickets();
}

async function replaceTickets() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  try {
    const previous = await prisma.healthTicket.findMany({
      include: { comments: true, reminders: true },
      orderBy: { createdAt: 'asc' },
    });
    const backupDirectory = path.resolve('.tmp');
    fs.mkdirSync(backupDirectory, { recursive: true });
    const backupPath = path.join(
      backupDirectory,
      `health-tickets-before-csv-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    );
    fs.writeFileSync(backupPath, JSON.stringify(previous, null, 2), 'utf8');

    await prisma.$transaction(async (transaction) => {
      await transaction.healthTicket.deleteMany({});
      await transaction.healthTicket.createMany({ data: tickets });
    });

    const active = await prisma.healthTicket.findMany({
      where: { deletedAt: null },
      select: { ticketNumber: true, status: true, healthData: true },
      orderBy: { ticketNumber: 'asc' },
    });
    if (
      active.length !== tickets.length ||
      active[0]?.ticketNumber !== 'HD-CSV-20260924-0001' ||
      active.at(-1)?.ticketNumber !== `HD-CSV-20260924-${String(tickets.length).padStart(4, '0')}`
    ) {
      throw new Error('The imported Health Department tickets could not be verified.');
    }
    console.log(JSON.stringify({ imported: active.length, removed: previous.length, backupPath }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}
