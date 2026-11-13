import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';

export const opportunityFields = ['propertyName', 'linkedPropertyName', 'estimateNumber', 'estimateAmount', 'status', 'categories', 'contractor', 'name', 'creationDate', 'requestedBy', 'approvalDate', 'approvedBy', 'estimatedRepairDate', 'inSkimmer', 'assignedTechnician', 'actualRepairDate', 'invoiceNumber', 'invoiceAmount', 'invoiceDate', 'approvalTime', 'repairTime', 'invoiceTime'] as const;
export type OpportunityField = typeof opportunityFields[number];
export const dateFields = ['creationDate', 'approvalDate', 'estimatedRepairDate', 'actualRepairDate', 'invoiceDate'] as const;
const csvNames = [
  ['Title', 'Property'], ['Link Propiedad', 'Linked property'], ['Número Estimado', 'N�mero Estimado', 'Estimate number'], ['Valor estimado Bluelife', 'Estimate amount'], ['Estatus', 'Status'], ['Categorización', 'Categorizaci�n', 'Categories'], ['CONTRACTOR', 'Contractor'], ['Oportunity Name', 'Opportunity name'], ['Fecha de Creación', 'Fecha de Creaci�n', 'Created / received date'], ['Solicitado por', 'Requested by'], ['Fecha Aprobación', 'Fecha Aprobaci�n', 'Approval date'], ['Aprobado Por', 'Approved by'], ['Fecha de Reparación Estimada', 'Fecha de Reparaci�n Estimada', 'Estimated repair date'], ['Skimmer'], ['Tech Asignado', 'Assigned technician'], ['Fecha de Reparación Real', 'Fecha de Reparaci�n Real', 'Actual repair date'], ['%23 Invoice', '# Invoice', 'Invoice number'], ['Valor de Invoice', 'Invoice amount'], ['Fecha Invoice', 'Invoice date'], ['Tiempo en ser aprobado', 'Time to approve'], ['Tiempo en ser reparado', 'Time to repair'], ['Tiempo en ser facturado', 'Time to invoice'],
];
export const propertyKey = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
const text = (value: unknown) => value === null || value === undefined || !String(value).trim() ? null : String(value).trim();
const headerKey = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

export function dateValue(value: unknown): Date | null {
  const raw = text(value);
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/), us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!iso && !us) throw new Error('Use a valid date in YYYY-MM-DD or M/D/YYYY format.');
  const [year, month, day] = iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : [Number(us![3]), Number(us![1]), Number(us![2])];
  const result = new Date(Date.UTC(year, month - 1, day));
  if (result.getUTCFullYear() !== year || result.getUTCMonth() !== month - 1 || result.getUTCDate() !== day) throw new Error(`Invalid date: ${raw}.`);
  return result;
}
export function moneyValue(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  let number = raw.replace(/[$\s]/g, '');
  // The starting CSV mixes US amounts with dot-grouped invoice amounts
  // (1.610 and 6.288.50). Keep the untouched value in sourceMetadata.
  if (/^-?\d{1,3}(?:\.\d{3})+(?:\.\d{1,2})?$/.test(number)) {
    const parts = number.split('.'), decimal = parts[parts.length - 1].length <= 2 ? parts.pop() : null;
    number = parts.join('') + (decimal ? `.${decimal}` : '');
  } else if (/^-?\d{1,3}(?:\.\d{3})*,\d{1,2}$/.test(number)) number = number.replaceAll('.', '').replace(',', '.');
  else number = number.replaceAll(',', '');
  if (!/^-?\d{1,12}(?:\.\d{1,2})?$/.test(number)) throw new Error('Use a valid amount with no more than two decimal places.');
  return number;
}
export function normalizeOpportunity(input: Partial<Record<OpportunityField, unknown>>) {
  const result: Record<string, unknown> = {};
  for (const field of opportunityFields) {
    if (input[field] === undefined) continue;
    const value = input[field];
    if ((dateFields as readonly string[]).includes(field)) result[field] = dateValue(value);
    else if (field === 'estimateAmount' || field === 'invoiceAmount') result[field] = moneyValue(value);
    else if (field === 'categories') result[field] = [...new Set((Array.isArray(value) ? value : text(value)?.split(',') || []).map((item) => text(item)).filter((item): item is string => Boolean(item) && item !== '[]'))];
    else if (field === 'inSkimmer') {
      if (value === null || value === '') result[field] = null;
      else if (value === true || String(value).toLowerCase() === 'true') result[field] = true;
      else if (value === false || String(value).toLowerCase() === 'false') result[field] = false;
      else throw new Error('Skimmer must be true, false, or empty.');
    } else result[field] = text(value);
  }
  if ('propertyName' in result && !result.propertyName) throw new Error('Property is required.');
  return result;
}

export function parseOpportunityCsv(buffer: Buffer, fileName: string) {
  const rows = parse(buffer, { bom: true, skip_empty_lines: true, relax_column_count: false }) as string[][];
  const headers = rows.shift();
  if (!headers) throw new Error('The CSV is empty.');
  const indexes = csvNames.map((aliases) => headers.findIndex((header) => aliases.some((name) => headerKey(name) === headerKey(header))));
  if (indexes.some((index) => index < 0)) throw new Error(`The CSV is missing columns: ${indexes.flatMap((index, field) => index < 0 ? csvNames[field][csvNames[field].length - 1] : []).join(', ')}.`);
  if (rows.length > 10000) throw new Error('Import no more than 10,000 rows at a time.');
  const seen = new Map<string, number>();
  return rows.map((row, rowIndex) => {
    try {
      const sourceValues = opportunityFields.map((_, index) => row[indexes[index]].trim());
      const input = Object.fromEntries(opportunityFields.map((field, index) => [field, sourceValues[index]]));
      const data = normalizeOpportunity(input);
      const hash = createHash('sha256').update(JSON.stringify(sourceValues)).digest('hex');
      const occurrence = (seen.get(hash) || 0) + 1; seen.set(hash, occurrence);
      return { ...data, propertyName: data.propertyName as string, linkedPropertyName: data.linkedPropertyName as string | null, source: 'CSV', sourceRecordId: `${hash}:${occurrence}`, sourceMetadata: { fileName, row: rowIndex + 2, original: Object.fromEntries(headers.map((header, index) => [header, row[index]])) } };
    } catch (error) { throw new Error(`Row ${rowIndex + 2}: ${(error as Error).message}`); }
  });
}

export function buildPropertyMatches(properties: Array<{ id: string; name: string }>) {
  const matches = new Map<string, string[]>();
  for (const property of properties) { const key = propertyKey(property.name); matches.set(key, [...(matches.get(key) || []), property.id]); }
  return (names: Array<string | null | undefined>) => {
    const ids = [...new Set(names.flatMap((name) => name ? matches.get(propertyKey(name)) || [] : []))];
    return ids.length === 1 ? ids[0] : null;
  };
}
