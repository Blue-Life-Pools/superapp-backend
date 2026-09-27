import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { parse } from 'csv-parse/sync';

type CsvRow = Record<string, string | undefined>;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not configured.');

const args = process.argv.slice(2);
const applyChanges = args.includes('--apply');
const csvArgument = args.find((argument) => argument !== '--apply');
if (!csvArgument) {
  throw new Error(
    'Usage: npx tsx scripts/import-chemical-technicians.ts <technicians.csv> [--apply]',
  );
}

const csvPath = path.resolve(csvArgument);
const rows: CsvRow[] = parse(fs.readFileSync(csvPath), {
  bom: true,
  columns: true,
  skip_empty_lines: true,
  trim: true,
});

const technicians = rows
  .map((row) => ({
    name: row['Técnicos']?.trim() ?? '',
    whatsappNumber: row.Celular?.replace(/\D/g, '') ?? '',
  }))
  .filter(({ name, whatsappNumber }) => name && whatsappNumber);

const duplicateNames = technicians.filter(
  (technician, index) =>
    technicians.findIndex((item) => item.name === technician.name) !== index,
);
const duplicateNumbers = technicians.filter(
  (technician, index) =>
    technicians.findIndex(
      (item) => item.whatsappNumber === technician.whatsappNumber,
    ) !== index,
);
if (duplicateNames.length || duplicateNumbers.length) {
  throw new Error(
    'The CSV contains duplicate technician names or phone numbers.',
  );
}
if (
  technicians.some(
    ({ whatsappNumber }) =>
      whatsappNumber.length < 10 || whatsappNumber.length > 15,
  )
) {
  throw new Error('One or more phone numbers are invalid.');
}

console.log(`Valid technician records: ${technicians.length}`);
console.log(technicians.map(({ name }) => name).join('\n'));

if (!applyChanges) {
  console.log('Dry run only. Add --apply to update the database.');
} else {
  void applyTechnicians();
}

async function applyTechnicians() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  try {
    await prisma.$transaction([
      prisma.chemicalTechnician.updateMany({ data: { active: false } }),
      ...technicians.map((technician) =>
        prisma.chemicalTechnician.upsert({
          where: { whatsappNumber: technician.whatsappNumber },
          update: {
            name: technician.name,
            whatsappNumber: technician.whatsappNumber,
            active: true,
          },
          create: technician,
        }),
      ),
    ]);
    const activeTechnicians = await prisma.chemicalTechnician.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { name: true, whatsappNumber: true },
    });
    if (
      activeTechnicians.length !== technicians.length ||
      technicians.some(
        (technician) =>
          !activeTechnicians.some(
            (activeTechnician) =>
              activeTechnician.name === technician.name &&
              activeTechnician.whatsappNumber === technician.whatsappNumber,
          ),
      )
    ) {
      throw new Error(
        'The imported technician directory could not be verified.',
      );
    }
    console.log(`Imported technician records: ${technicians.length}`);
    console.log(
      `Verified active technician records: ${activeTechnicians.length}`,
    );
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
