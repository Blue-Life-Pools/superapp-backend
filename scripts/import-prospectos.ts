import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

import { parse } from 'csv-parse/sync';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL no está definida');
}

const adapter = new PrismaPg({
  connectionString,
});

const prisma = new PrismaClient({
  adapter,
});

const DRY_RUN = false;

type CsvRow = {
  Propiedad?: string;
  'Informacion Adjunta'?: string;
  'Tipo de Cliente'?: string;
  'Tipo de Propiedad'?: string;
  Segmento?: string;
  Direccion?: string;
  Ciudad?: string;
  Condado?: string;
  Estado?: string;
  ZIP?: string;
  Manager?: string;
  'Correo Manager'?: string;
  'Cel Manager'?: string;
  'Manager Regional'?: string;
  'Correo Manager Regional'?: string;
  Managment?: string;
  'Cuerpos de Agua'?: string;
  'Información Jefe Mantenimiento'?: string;
  'Fecha Visita'?: string;
  Seguimiento?: string;
};

function clean(value?: string | null): string | null {
  if (!value) return null;

  const result = value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return result || null;
}

function normalizeLeadSource(value?: string): string | null {
  const v = clean(value)?.toLowerCase();

  if (!v) return null;

  if (v === 'ruta') return 'ROUTE';
  if (v === 'referido') return 'REFERRAL';

  return v.toUpperCase();
}

function normalizePropertyType(value?: string): string | null {
  const v = clean(value)?.toLowerCase();

  if (!v) return null;

  if (v === 'comercial') return 'COMMERCIAL';
  if (v === 'residencial') return 'RESIDENTIAL';

  return v.toUpperCase();
}

function normalizeSegment(value?: string): string | null {
  const v = clean(value)?.toLowerCase();

  if (!v) return null;

  if (v === 'multifamily') return 'MULTIFAMILY';
  if (v === 'hoa') return 'HOA';
  if (v === 'hotel') return 'HOTEL';
  if (v === 'single family') return 'SINGLE_FAMILY';

  return v.toUpperCase().replace(/\s+/g, '_');
}

function normalizeState(value?: string): string | null {
  const v = clean(value);

  if (!v) return null;

  return v.toUpperCase();
}

function parseDate(value?: string): Date | null {
  const v = clean(value);

  if (!v) return null;

  const parts = v.split('/');

  if (parts.length !== 3) {
    return null;
  }

  const month = Number(parts[0]);
  const day = Number(parts[1]);
  const year = Number(parts[2]);

  if (!month || !day || !year) {
    return null;
  }

  return new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      12,
      0,
      0,
    ),
  );
}

function normalizeManagementName(
  value?: string,
): string | null {
  const v = clean(value);

  if (!v) return null;

  const lower = v.toLowerCase();

  const known: Record<string, string> = {
    greystar: 'Greystar',
    'highmark residential':
      'Highmark Residential',
    'nrp group': 'NRP Group',
    zrs: 'ZRS',
    rmi: 'RMI',
    'willow bridge': 'Willow Bridge',
  };

  return known[lower] ?? v;
}

function parseWaterBodies(value?: string) {
  const raw = clean(value);

  if (!raw) return [];

  const normalized = raw.toLowerCase();

  const results: Array<{
    name: string;
    type: string;
  }> = [];

  const patterns = [
    {
      regex: /(\d+)\s*back\s+pool/gi,
      type: 'POOL',
      name: 'Back Pool',
    },
    {
      regex: /(\d+)\s*front\s+pool/gi,
      type: 'POOL',
      name: 'Front Pool',
    },
    {
      regex: /(\d+)\s*(?:back\s+)?kiddie\s+pool/gi,
      type: 'POOL',
      name: 'Kiddie Pool',
    },
    {
      regex:
        /(\d+)\s*(?:club\s*house\s+pool|clubhouse\s+pool)/gi,
      type: 'POOL',
      name: 'Clubhouse Pool',
    },
    {
      regex: /(\d+)\s*(?:pool|piscina)s?/gi,
      type: 'POOL',
      name: 'Pool',
    },
    {
      regex: /(\d+)\s*(?:spa|hot\s+spa)s?/gi,
      type: 'SPA',
      name: 'Spa',
    },
    {
      regex: /(\d+)\s*(?:fountain|fuente)s?/gi,
      type: 'FOUNTAIN',
      name: 'Fountain',
    },
  ];

  const matchedRanges: Array<{
    start: number;
    end: number;
  }> = [];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;

    pattern.regex.lastIndex = 0;

    while (
      (match =
        pattern.regex.exec(normalized)) !==
      null
    ) {
      const start = match.index;
      const end =
        match.index + match[0].length;

      const overlaps =
        matchedRanges.some(
          (range) =>
            start < range.end &&
            end > range.start,
        );

      if (overlaps) {
        continue;
      }

      matchedRanges.push({
        start,
        end,
      });

      const quantity = Number(match[1]);

      for (
        let i = 1;
        i <= quantity;
        i++
      ) {
        results.push({
          name:
            quantity > 1
              ? `${pattern.name} ${i}`
              : pattern.name,

          type: pattern.type,
        });
      }
    }
  }

  if (results.length === 0) {
    results.push({
      name: raw,
      type: 'OTHER',
    });
  }

  return results;
}

async function main() {
  const csvPath = path.resolve(
    process.cwd(),
    '1. PROSPECTOS (1).csv',
  );

  if (!fs.existsSync(csvPath)) {
    throw new Error(
      `No encontré el archivo CSV en: ${csvPath}`,
    );
  }

  const file = fs.readFileSync(
    csvPath,
    'utf8',
  );

  const rows = parse(file, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
    trim: true,
  }) as CsvRow[];

  const validRows = rows.filter(
    (row) => clean(row.Propiedad),
  );

  let propertyCount = 0;
  let companyCount = 0;
  let contactCount = 0;
  let waterBodyCount = 0;
  let activityCount = 0;

  let importedCount = 0;
  let skippedCount = 0;

  console.log('');

  console.log(
    '===== BLUE LIFE CRM - IMPORT PROSPECTOS =====',
  );

  console.log(
    `Modo: ${
      DRY_RUN
        ? 'SIMULACIÓN'
        : 'IMPORTACIÓN REAL'
    }`,
  );

  console.log(
    `Filas CSV: ${rows.length}`,
  );

  console.log(
    `Propiedades válidas: ${validRows.length}`,
  );

  console.log('');

  for (
    let index = 0;
    index < validRows.length;
    index++
  ) {
    const row = validRows[index];

    const propertyName =
      clean(row.Propiedad)!;

    const managementName =
      normalizeManagementName(
        row.Managment,
      );

    const managerName =
      clean(row.Manager);

    const managerEmail =
      clean(
        row['Correo Manager'],
      );

    const managerPhone =
      clean(
        row['Cel Manager'],
      );

    const regionalName =
      clean(
        row['Manager Regional'],
      );

    const regionalEmail =
      clean(
        row[
          'Correo Manager Regional'
        ],
      );

    const visitDate =
      parseDate(
        row['Fecha Visita'],
      );

    const waterBodies =
      parseWaterBodies(
        row['Cuerpos de Agua'],
      );

    propertyCount++;

    if (managementName) {
      companyCount++;
    }

    if (
      managerName ||
      managerEmail ||
      managerPhone
    ) {
      contactCount++;
    }

    if (
      regionalName ||
      regionalEmail
    ) {
      contactCount++;
    }

    waterBodyCount +=
      waterBodies.length;

    if (visitDate) {
      activityCount++;
    }

    if (
      clean(row.Seguimiento)
    ) {
      activityCount++;
    }

    console.log(
      `${index + 1}. ${propertyName}`,
    );

    console.log({
      property:
        propertyName,

      attachedInfo:
        clean(
          row[
            'Informacion Adjunta'
          ],
        ),

      originalClientType:
        clean(
          row[
            'Tipo de Cliente'
          ],
        ),

      leadSource:
        normalizeLeadSource(
          row[
            'Tipo de Cliente'
          ],
        ),

      propertyType:
        normalizePropertyType(
          row[
            'Tipo de Propiedad'
          ],
        ),

      segment:
        normalizeSegment(
          row.Segmento,
        ),

      address:
        clean(row.Direccion),

      city:
        clean(row.Ciudad),

      county:
        clean(row.Condado),

      state:
        normalizeState(
          row.Estado,
        ),

      zipCode:
        clean(row.ZIP),

      management:
        managementName,

      manager:
        managerName,

      managerEmail,

      managerPhone,

      regionalManager:
        regionalName,

      regionalManagerEmail:
        regionalEmail,

      waterBodiesOriginal:
        clean(
          row[
            'Cuerpos de Agua'
          ],
        ),

      waterBodies,

      maintenanceChiefInfo:
        clean(
          row[
            'Información Jefe Mantenimiento'
          ],
        ),

      visitDate,

      followUp:
        clean(
          row.Seguimiento,
        ),
    });

    if (DRY_RUN) {
      continue;
    }

    /*
     * PROTECCIÓN CONTRA DUPLICADOS
     *
     * Si ya importamos esta fila
     * anteriormente, no volvemos
     * a crearla.
     */
    const existingProperty =
      await prisma.property.findFirst({
        where: {
          legacySource:
            'SHAREPOINT_1_PROSPECTOS',

          legacyRow:
            index + 2,
        },
      });

    if (existingProperty) {
      skippedCount++;

      console.log(
        `YA EXISTE: ${propertyName}. Se omite.`,
      );

      console.log('');

      continue;
    }

    let managementCompanyId:
      | string
      | null = null;

    if (managementName) {
      const company =
        await prisma.managementCompany.upsert({
          where: {
            name:
              managementName,
          },

          update: {},

          create: {
            name:
              managementName,
          },
        });

      managementCompanyId =
        company.id;
    }

    const property =
      await prisma.property.create({
        data: {
          name:
            propertyName,

          leadSource:
            normalizeLeadSource(
              row[
                'Tipo de Cliente'
              ],
            ),

          propertyType:
            normalizePropertyType(
              row[
                'Tipo de Propiedad'
              ],
            ),

          segment:
            normalizeSegment(
              row.Segmento,
            ),


          addressLine1:
            clean(
              row.Direccion,
            ),

          city:
            clean(
              row.Ciudad,
            ),

          county:
            clean(
              row.Condado,
            ),

          state:
            normalizeState(
              row.Estado,
            ),

          zipCode:
            clean(
              row.ZIP,
            ),

          managementCompanyId,

          sharepointFolderUrl:
            clean(
              row[
                'Informacion Adjunta'
              ],
            ),

          maintenanceChiefInfo:
            clean(
              row[
                'Información Jefe Mantenimiento'
              ],
            ),

          followUpNotes:
            clean(
              row.Seguimiento,
            ),

          legacySource:
            'SHAREPOINT_1_PROSPECTOS',

          legacyRow:
            index + 2,
        },
      });

    if (
      managerName ||
      managerEmail ||
      managerPhone
    ) {
      const contact =
        await prisma.contact.create({
          data: {
            firstName:
              managerName,

            email:
              managerEmail,

            phone:
              managerPhone,

            managementCompanyId,
          },
        });

      await prisma.propertyContact.create({
        data: {
          propertyId:
            property.id,

          contactId:
            contact.id,

          role:
            'PROPERTY_MANAGER',

          isPrimary:
            true,
        },
      });
    }

    if (
      regionalName ||
      regionalEmail
    ) {
      const contact =
        await prisma.contact.create({
          data: {
            firstName:
              regionalName,

            email:
              regionalEmail,

            managementCompanyId,
          },
        });

      await prisma.propertyContact.create({
        data: {
          propertyId:
            property.id,

          contactId:
            contact.id,

          role:
            'REGIONAL_MANAGER',

          isPrimary:
            false,
        },
      });
    }

    for (
      const waterBody
      of waterBodies
    ) {
      await prisma.waterBody.create({
        data: {
          propertyId:
            property.id,

          name:
            waterBody.name,

          type:
            waterBody.type,
        },
      });
    }

    if (visitDate) {
      await prisma.salesActivity.create({
        data: {
          propertyId:
            property.id,

          type:
            'PROPERTY_VISIT',

          occurredAt:
            visitDate,

          notes:
            null,
        },
      });
    }

    const followUp =
      clean(
        row.Seguimiento,
      );

    if (followUp) {
      await prisma.salesActivity.create({
        data: {
          propertyId:
            property.id,

          type:
            'FOLLOW_UP',

          occurredAt:
            visitDate ??
            new Date(),

          notes:
            followUp,
        },
      });
    }

    importedCount++;

    console.log(
      `IMPORTADA: ${propertyName}`,
    );

    console.log('');
  }

  console.log('');

  console.log(
    '===== RESUMEN =====',
  );

  console.log(
    `Properties CSV: ${propertyCount}`,
  );

  console.log(
    `Management companies detectadas: ${companyCount}`,
  );

  console.log(
    `Contacts detectados: ${contactCount}`,
  );

  console.log(
    `Water bodies detectados: ${waterBodyCount}`,
  );

  console.log(
    `Sales activities detectadas: ${activityCount}`,
  );

  if (!DRY_RUN) {
    console.log(
      `Propiedades importadas: ${importedCount}`,
    );

    console.log(
      `Propiedades omitidas por existir: ${skippedCount}`,
    );
  }

  if (DRY_RUN) {
    console.log('');

    console.log(
      'NO SE MODIFICÓ LA BASE DE DATOS.',
    );

    console.log(
      'Para importar realmente cambia:',
    );

    console.log(
      'const DRY_RUN = true;',
    );

    console.log(
      'por:',
    );

    console.log(
      'const DRY_RUN = false;',
    );
  }
}

main()
  .catch((error) => {
    console.error(
      'ERROR DURANTE LA IMPORTACIÓN:',
      error,
    );

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
