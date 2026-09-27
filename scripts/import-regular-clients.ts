import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { parse } from 'csv-parse/sync';

type CsvRow = Record<string, string | undefined>;

type PropertyMatch = {
  id: string;
  code: string | null;
  name: string;
  addressLine1: string | null;
  zipCode: string | null;
  sharepointFolderUrl: string | null;
  lifecycleStatus: string;
  serviceStartDate: Date | null;
  regularMaintenanceData: Prisma.JsonValue | null;
  _count: {
    contacts: number;
    waterBodies: number;
  };
};

type ImportPlan = {
  operation: 'UPDATE' | 'CREATE';
  property: PropertyMatch | null;
  regularRow: CsvRow;
  regularRowNumber: number;
  masterRow: CsvRow | null;
  matchMethod: string;
  serviceStartDate: Date | null;
  sharepointFolderUrl: string | null;
  maintenanceData: Prisma.InputJsonValue;
};

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not configured.');
}

const args = process.argv.slice(2);
const applyChanges = args.includes('--apply');
const summaryOnly = args.includes('--summary');
const fileArgs = args.filter(
  (argument) => !['--apply', '--summary'].includes(argument),
);

if (fileArgs.length !== 2) {
    throw new Error(
    'Usage: npx tsx scripts/import-regular-clients.ts <regular-maintenance.csv> <properties.csv> [--apply] [--summary]',
  );
}

const [regularCsvPath, propertiesCsvPath] = fileArgs.map((filePath) =>
  path.resolve(filePath),
);

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

function clean(value?: string | null) {
  const result = value?.replace(/\s+/g, ' ').trim();
  return result || null;
}

function strictKey(value?: string | null) {
  return (clean(value) ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function canonicalKey(value?: string | null) {
  return strictKey(value).replace(/[^a-z0-9]/g, '');
}

function skuKey(value?: string | null) {
  return canonicalKey(value).toUpperCase();
}

function addressKey(address?: string | null, zipCode?: string | null) {
  const addressPart = canonicalKey(address);
  const zipPart = canonicalKey(zipCode);
  return addressPart ? `${addressPart}|${zipPart}` : '';
}

function parseDate(value?: string | null) {
  const normalized = clean(value);
  if (!normalized) return null;

  const match = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return null;

  const [, monthText, dayText, yearText] = match;
  const month = Number(monthText);
  const day = Number(dayText);
  const year = Number(yearText);
  const date = new Date(Date.UTC(year, month - 1, day, 12));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function parseNumber(value?: string | null) {
  const normalized = clean(value)?.replace(/[$,]/g, '');
  if (!normalized) return null;
  const result = Number(normalized);
  return Number.isFinite(result) ? result : null;
}

function parseBoolean(value?: string | null) {
  const normalized = strictKey(value);
  if (normalized === 'true' || normalized === 'yes' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === 'no' || normalized === '0') {
    return false;
  }
  return null;
}

function readCsv(filePath: string) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`CSV file not found: ${filePath}`);
  }

  return parse(fs.readFileSync(filePath, 'utf8'), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
    trim: true,
  }) as CsvRow[];
}

function addToIndex<T>(index: Map<string, T[]>, key: string, value: T) {
  if (!key) return;
  const values = index.get(key) ?? [];
  values.push(value);
  index.set(key, values);
}

function unique<T>(values?: T[]) {
  return values?.length === 1 ? values[0] : null;
}

function distinct<T>(values: T[]) {
  return [...new Set(values)];
}

function validSharePointUrl(value?: string | null) {
  const normalized = clean(value);
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    return url.protocol === 'https:' && url.hostname.endsWith('sharepoint.com')
      ? normalized
      : null;
  } catch {
    return null;
  }
}

function normalizePropertyType(value?: string | null) {
  const normalized = strictKey(value);
  if (normalized === 'comercial' || normalized === 'commercial') {
    return 'COMMERCIAL';
  }
  if (normalized === 'residencial' || normalized === 'residential') {
    return 'RESIDENTIAL';
  }
  return clean(value)?.toUpperCase() ?? 'COMMERCIAL';
}

function normalizeSegment(value?: string | null) {
  const normalized = clean(value);
  if (!normalized) return null;

  let label = normalized;
  try {
    const parsed = JSON.parse(normalized) as unknown;
    if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
      [label] = parsed;
    }
  } catch {
    // Some legacy rows contain a plain label instead of a JSON array.
  }

  const key = strictKey(label);
  const known: Record<string, string> = {
    multifamily: 'MULTIFAMILY',
    hoa: 'HOA',
    hotel: 'HOTEL',
    'single family': 'SINGLE_FAMILY',
  };
  return known[key] ?? key.toUpperCase().replace(/\s+/g, '_');
}

function parseWaterBodies(value?: string | null) {
  const normalized = clean(value) ?? '';
  const definitions = [
    {
      regex: /(\d+)\s*(?:piscina|piscinas|pool|pools)/i,
      type: 'SWIMMING_POOL',
      name: 'Pool',
    },
    {
      regex: /(\d+)\s*(?:spa|spas)/i,
      type: 'SPA',
      name: 'Spa',
    },
    {
      regex: /(\d+)\s*(?:fuente|fuentes|fountain|fountains)/i,
      type: 'DECORATIVE_WATER_FEATURE',
      name: 'Fountain',
    },
  ];
  const bodies: Array<{ name: string; type: string; active: boolean }> = [];

  for (const definition of definitions) {
    const quantity = Number(normalized.match(definition.regex)?.[1] ?? 0);
    for (let index = 1; index <= quantity; index += 1) {
      bodies.push({
        name: quantity === 1 ? definition.name : `${definition.name} ${index}`,
        type: definition.type,
        active: true,
      });
    }
  }

  return bodies;
}

function contactDetails(regularRow: CsvRow, masterRow: CsvRow | null) {
  const managerName = clean(masterRow?.['Manager ']);
  const managerEmail =
    clean(masterRow?.['Correo Manager']) ?? clean(regularRow['Correo Manager']);
  const managerPhone = clean(masterRow?.['Cel Manager']);

  if (!managerName && !managerEmail && !managerPhone) return null;
  return { managerName, managerEmail, managerPhone };
}

function maintenanceChiefInfo(masterRow: CsvRow | null) {
  const name = clean(masterRow?.['Jefe Mantenimiento']);
  const phone = clean(masterRow?.['Cel Jefe Mantenimiento']);
  return [name, phone].filter(Boolean).join(' · ') || null;
}

async function main() {
  const regularRows = readCsv(regularCsvPath).filter((row) =>
    clean(row.Propiedades),
  );
  const masterRows = readCsv(propertiesCsvPath).filter((row) => clean(row.Title));
  const properties = await prisma.property.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      code: true,
      name: true,
      addressLine1: true,
      zipCode: true,
      sharepointFolderUrl: true,
      lifecycleStatus: true,
      serviceStartDate: true,
      regularMaintenanceData: true,
      _count: {
        select: {
          contacts: true,
          waterBodies: true,
        },
      },
    },
  });

  const propertyByCode = new Map<string, PropertyMatch[]>();
  const propertyByStrictName = new Map<string, PropertyMatch[]>();
  const propertyByCanonicalName = new Map<string, PropertyMatch[]>();
  const propertyByAddress = new Map<string, PropertyMatch[]>();

  for (const property of properties) {
    addToIndex(propertyByCode, skuKey(property.code), property);
    addToIndex(propertyByStrictName, strictKey(property.name), property);
    addToIndex(propertyByCanonicalName, canonicalKey(property.name), property);
    addToIndex(
      propertyByAddress,
      addressKey(property.addressLine1, property.zipCode),
      property,
    );
  }

  const masterBySku = new Map<string, CsvRow[]>();
  const masterByStrictName = new Map<string, CsvRow[]>();
  const masterByCanonicalName = new Map<string, CsvRow[]>();
  const masterByAddress = new Map<string, CsvRow[]>();

  for (const row of masterRows) {
    addToIndex(masterBySku, skuKey(row.SKU), row);
    addToIndex(masterByStrictName, strictKey(row.Title), row);
    addToIndex(masterByCanonicalName, canonicalKey(row.Title), row);
    addToIndex(masterByAddress, addressKey(row['Direccion '], row.ZIP), row);
  }

  const plans: ImportPlan[] = [];
  const notFoundInCrm: string[] = [];
  const ambiguous: Array<{ regular: string; candidates: string[] }> = [];
  const matchMethods: Record<string, number> = {};
  const invalidStartDates: Array<{ property: string; value: string }> = [];

  for (const [regularIndex, row] of regularRows.entries()) {
    const regularName = clean(row.Propiedades)!;
    const codeCandidates = propertyByCode.get(skuKey(row.SKU));
    const strictNameCandidates = propertyByStrictName.get(strictKey(regularName));
    const canonicalNameCandidates = propertyByCanonicalName.get(
      canonicalKey(regularName),
    );
    const addressCandidates = propertyByAddress.get(
      addressKey(row['Direccion '], row.ZIP),
    );

    let property = unique(codeCandidates);
    let matchMethod = property ? 'code' : '';

    if (!property) {
      property = unique(strictNameCandidates);
      if (property) matchMethod = 'strict-name';
    }
    if (!property) {
      property = unique(canonicalNameCandidates);
      if (property) matchMethod = 'canonical-name';
    }
    if (!property) {
      property = unique(addressCandidates);
      if (property) matchMethod = 'address';
    }

    if (!property) {
      const candidates = distinct(
        [
          ...(codeCandidates ?? []),
          ...(strictNameCandidates ?? []),
          ...(canonicalNameCandidates ?? []),
          ...(addressCandidates ?? []),
        ].map((candidate) => candidate.name),
      );

      if (candidates.length > 0) {
        ambiguous.push({ regular: regularName, candidates });
        continue;
      }
      notFoundInCrm.push(regularName);
    }

    const masterMatch =
      unique(masterBySku.get(skuKey(row.SKU))) ??
      unique(masterByStrictName.get(strictKey(regularName))) ??
      unique(masterByCanonicalName.get(canonicalKey(regularName))) ??
      unique(masterByAddress.get(addressKey(row['Direccion '], row.ZIP)));

    let sharepointFolderUrl = validSharePointUrl(
      masterMatch?.['Información Adjunta'],
    );

    if (!sharepointFolderUrl) {
      const linkedAlternatives = distinct(
        [
          ...(masterByCanonicalName.get(canonicalKey(regularName)) ?? []),
          ...(masterByAddress.get(addressKey(row['Direccion '], row.ZIP)) ?? []),
        ]
          .map((candidate) =>
            validSharePointUrl(candidate['Información Adjunta']),
          )
          .filter((value): value is string => Boolean(value)),
      );
      if (linkedAlternatives.length === 1) {
        [sharepointFolderUrl] = linkedAlternatives;
      }
    }

    const serviceStartDate = parseDate(row['Fecha Inicio']);
    if (clean(row['Fecha Inicio']) && !serviceStartDate) {
      invalidStartDates.push({
        property: regularName,
        value: clean(row['Fecha Inicio'])!,
      });
    }

    const maintenanceData = {
      source: path.basename(regularCsvPath),
      sourceSku: clean(row.SKU),
      propertyName: regularName,
      propertyReference: clean(row['Link Propiedades']),
      technicalSupervisor: clean(row['Supervisor Técnico']),
      routeTechnician: clean(row['Técnico en Ruta']),
      waterBodiesSummary: clean(row['Cuerpos de Agua']),
      city: clean(row.Ciudad),
      route: clean(row.Ruta),
      serviceStartDate: clean(row['Fecha Inicio']),
      monthlyFee: parseNumber(row.Mensualidad),
      cya: parseNumber(row.CYA),
      latitude: parseNumber(row.Latitude),
      longitude: parseNumber(row.Longitude),
      zipCode: clean(row.ZIP),
      managementCompany: clean(row.Managment),
      managerEmail: clean(row['Correo Manager']),
      address: clean(row['Direccion ']),
      serviceEndDate: clean(row['Fecha Finalización']),
      temporarilySuspended: parseBoolean(row['Suspendido Temporalmente']),
      sharepointFolderUrl,
    } as Prisma.InputJsonValue;

    plans.push({
      operation: property ? 'UPDATE' : 'CREATE',
      property,
      regularRow: row,
      regularRowNumber: regularIndex + 2,
      masterRow: masterMatch,
      matchMethod,
      serviceStartDate,
      sharepointFolderUrl,
      maintenanceData,
    });
    const method = matchMethod || 'new-property';
    matchMethods[method] = (matchMethods[method] ?? 0) + 1;
  }

  const duplicatePropertyMatches = [...plans]
    .reduce<Map<string, ImportPlan[]>>((groups, plan) => {
      if (!plan.property) return groups;
      const values = groups.get(plan.property.id) ?? [];
      values.push(plan);
      groups.set(plan.property.id, values);
      return groups;
    }, new Map());
  const duplicatePlans = [...duplicatePropertyMatches.values()].filter(
    (group) => group.length > 1,
  );

  if (duplicatePlans.length > 0) {
    throw new Error(
      `Import stopped: ${duplicatePlans.length} CRM properties matched more than one maintenance row.`,
    );
  }

  const existingPlans = plans.filter(
    (plan): plan is ImportPlan & { property: PropertyMatch } =>
      plan.operation === 'UPDATE' && Boolean(plan.property),
  );
  const createPlans = plans.filter((plan) => plan.operation === 'CREATE');
  const duplicateNewCodes = [
    ...createPlans.reduce<Map<string, ImportPlan[]>>((groups, plan) => {
      const key = skuKey(plan.regularRow.SKU);
      if (!key) return groups;
      const values = groups.get(key) ?? [];
      values.push(plan);
      groups.set(key, values);
      return groups;
    }, new Map()).values(),
  ].filter((group) => group.length > 1);

  if (duplicateNewCodes.length > 0) {
    throw new Error(
      `Import stopped: ${duplicateNewCodes.length} maintenance SKUs are duplicated.`,
    );
  }

  const report = {
    mode: applyChanges ? 'APPLY' : 'DRY_RUN',
    crmProperties: properties.length,
    regularRows: regularRows.length,
    masterRows: masterRows.length,
    matchedExisting: existingPlans.length,
    toCreate: createPlans.length,
    plannedTotal: plans.length,
    matchMethods,
    withServiceStartDate: plans.filter((plan) => plan.serviceStartDate).length,
    withSharePointLinkFromMaster: plans.filter(
      (plan) => plan.sharepointFolderUrl,
    ).length,
    existingSharePointLinksPreserved: plans.filter(
      (plan) =>
        !plan.sharepointFolderUrl && Boolean(plan.property?.sharepointFolderUrl),
    ).length,
    withoutMasterMatch: plans
      .filter((plan) => !plan.masterRow)
      .map((plan) => clean(plan.regularRow.Propiedades)),
    newPropertiesWithContact: createPlans.filter((plan) =>
      contactDetails(plan.regularRow, plan.masterRow),
    ).length,
    newPropertiesWithManagement: createPlans.filter((plan) => {
      const management =
        clean(plan.masterRow?.Managment) ?? clean(plan.regularRow.Managment);
      return Boolean(management && strictKey(management) !== 'no aplica');
    }).length,
    newWaterBodies: createPlans.reduce(
      (count, plan) =>
        count + parseWaterBodies(plan.regularRow['Cuerpos de Agua']).length,
      0,
    ),
    storedMatches: {
      asClients: existingPlans.filter(
        (plan) => plan.property.lifecycleStatus === 'CLIENT',
      ).length,
      withServiceStartDate: existingPlans.filter(
        (plan) => plan.property.serviceStartDate,
      ).length,
      withMaintenanceData: existingPlans.filter(
        (plan) => plan.property.regularMaintenanceData !== null,
      ).length,
      withSharePointLink: existingPlans.filter(
        (plan) => plan.property.sharepointFolderUrl,
      ).length,
      withContacts: existingPlans.filter(
        (plan) => plan.property._count.contacts > 0,
      ).length,
      withWaterBodies: existingPlans.filter(
        (plan) => plan.property._count.waterBodies > 0,
      ).length,
      totalWaterBodies: existingPlans.reduce(
        (count, plan) => count + plan.property._count.waterBodies,
        0,
      ),
    },
    matchedProperties: existingPlans.map((plan) => ({
      crmProperty: plan.property.name,
      maintenanceProperty: clean(plan.regularRow.Propiedades),
      method: plan.matchMethod,
      serviceStartDate: plan.serviceStartDate?.toISOString() ?? null,
      sharePointLinked: Boolean(
        plan.sharepointFolderUrl ?? plan.property.sharepointFolderUrl,
      ),
    })),
    newProperties: createPlans.map((plan) => ({
      property: clean(plan.regularRow.Propiedades),
      serviceStartDate: plan.serviceStartDate?.toISOString() ?? null,
      sharePointLinked: Boolean(plan.sharepointFolderUrl),
    })),
    notFoundInCrm,
    ambiguous,
    invalidStartDates,
  };

  const {
    matchedProperties,
    newProperties,
    notFoundInCrm: _notFoundInCrm,
    ...summaryReport
  } = report;
  console.log(
    JSON.stringify(summaryOnly ? summaryReport : report, null, 2),
  );

  if (!applyChanges) {
    console.log('Dry run only. No database records were changed.');
    return;
  }

  const updates = existingPlans.map((plan) => {
    const latitude = parseNumber(plan.regularRow.Latitude);
    const longitude = parseNumber(plan.regularRow.Longitude);

    return prisma.property.update({
      where: { id: plan.property.id },
      data: {
        lifecycleStatus: 'CLIENT',
        ...(plan.serviceStartDate
          ? { serviceStartDate: plan.serviceStartDate }
          : {}),
        regularMaintenanceData: plan.maintenanceData,
        ...(latitude !== null ? { latitude } : {}),
        ...(longitude !== null ? { longitude } : {}),
        ...(plan.sharepointFolderUrl
          ? { sharepointFolderUrl: plan.sharepointFolderUrl }
          : {}),
      },
    });
  });

  const creates = createPlans.map((plan) => {
    const row = plan.regularRow;
    const master = plan.masterRow;
    const latitude = parseNumber(row.Latitude);
    const longitude = parseNumber(row.Longitude);
    const managementCandidate = clean(master?.Managment) ?? clean(row.Managment);
    const managementName =
      strictKey(managementCandidate) === 'no aplica' ? null : managementCandidate;
    const contact = contactDetails(row, master);
    const waterBodies = parseWaterBodies(row['Cuerpos de Agua']);

    return prisma.property.create({
      data: {
        code: clean(row.SKU),
        name: clean(row.Propiedades)!,
        propertyType: normalizePropertyType(master?.['Tipo de propiedad']),
        segment: normalizeSegment(master?.Segmento),
        addressLine1: clean(master?.['Direccion ']) ?? clean(row['Direccion ']),
        city: clean(master?.Ciudad) ?? clean(row.Ciudad),
        county: clean(master?.Condado),
        state: clean(master?.State)?.toUpperCase() ?? null,
        zipCode: clean(master?.ZIP) ?? clean(row.ZIP),
        formattedAddress: clean(row['Direccion ']),
        ...(latitude !== null ? { latitude } : {}),
        ...(longitude !== null ? { longitude } : {}),
        lifecycleStatus: 'CLIENT',
        serviceStartDate: plan.serviceStartDate,
        regularMaintenanceData: plan.maintenanceData,
        sharepointFolderUrl: plan.sharepointFolderUrl,
        maintenanceChiefInfo: maintenanceChiefInfo(master),
        legacySource: 'REGULAR_MAINTENANCE_CSV',
        legacyRow: plan.regularRowNumber,
        ...(managementName
          ? {
              managementCompany: {
                connectOrCreate: {
                  where: { name: managementName },
                  create: { name: managementName },
                },
              },
            }
          : {}),
        ...(contact
          ? {
              contacts: {
                create: {
                  role: 'PROPERTY_MANAGER',
                  isPrimary: true,
                  contact: {
                    create: {
                      firstName: contact.managerName,
                      email: contact.managerEmail?.toLowerCase() ?? null,
                      phone: contact.managerPhone,
                    },
                  },
                },
              },
            }
          : {}),
        ...(waterBodies.length > 0
          ? {
              waterBodies: {
                create: waterBodies,
              },
            }
          : {}),
      },
    });
  });

  const operations = [...updates, ...creates];
  const batchSize = 10;

  for (let offset = 0; offset < operations.length; offset += batchSize) {
    const batch = operations.slice(offset, offset + batchSize);
    await prisma.$transaction(batch, { timeout: 60_000 });
    console.log(
      `Committed ${Math.min(offset + batch.length, operations.length)} of ${operations.length} property operations.`,
    );
  }

  console.log(
    `Updated ${updates.length} existing properties and created ${creates.length} new clients.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
