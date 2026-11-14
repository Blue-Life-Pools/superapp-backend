import { Prisma } from '@prisma/client';
import { propertyKey } from './opportunity-data';

export const approvedOpportunityStatuses = ['Accepted', 'Approved'];
export type ApprovedMapRow = {
  id: string; propertyName: string; propertyId: string | null; linkedPropertyName: string | null;
  estimateNumber: string | null; estimateAmount: Prisma.Decimal | string | null; status: string | null; name: string | null;
  creationDate: Date | null; approvalDate: Date | null;
  property: { id: string; name: string; addressLine1: string | null; city: string | null; state: string | null; zipCode: string | null; formattedAddress: string | null; latitude: Prisma.Decimal | string | null; longitude: Prisma.Decimal | string | null; deletedAt: Date | null } | null;
};
const numberOrNull = (value: unknown) => value === null || value === undefined || String(value).trim() === '' || !Number.isFinite(Number(value)) ? null : Number(value);
type LocationIssue = 'PROPERTY_NOT_LINKED' | 'ADDRESS_MISSING' | 'COORDINATES_MISSING' | null;
type MapEstimate = { id: string; estimateNumber: string | null; estimateAmount: string | null; status: string | null; name: string | null; creationDate: string | null; approvalDate: string | null };
type MapProperty = { id: string; propertyId: string | null; name: string; address: string | null; latitude: number | null; longitude: number | null; locationIssue: LocationIssue; estimates: MapEstimate[]; totalAmount: string | null; missingAmounts: number };

export function buildApprovedOpportunityMap(rows: ApprovedMapRow[]) {
  const groups = new Map<string, MapProperty>();
  let total = new Prisma.Decimal(0), recordedAmounts = 0;
  for (const row of rows) {
    if (!approvedOpportunityStatuses.some(status => status.toLowerCase() === row.status?.trim().toLowerCase())) continue;
    const property = row.property?.deletedAt ? null : row.property;
    const key = property?.id || `unlinked:${propertyKey(row.propertyName)}`;
    let group = groups.get(key);
    if (!group) {
      const latitude = numberOrNull(property?.latitude), longitude = numberOrNull(property?.longitude);
      const located = latitude !== null && longitude !== null && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
      const address = property?.formattedAddress?.trim() || (property?.addressLine1?.trim() ? [property.addressLine1.trim(), property.city?.trim(), [property.state?.trim(), property.zipCode?.trim()].filter(Boolean).join(' ')].filter(Boolean).join(', ') : null);
      group = { id: key, propertyId: property?.id || null, name: property?.name || row.propertyName, address, latitude: located ? latitude : null, longitude: located ? longitude : null, locationIssue: located ? null : !property ? 'PROPERTY_NOT_LINKED' : !address ? 'ADDRESS_MISSING' : 'COORDINATES_MISSING', estimates: [], totalAmount: null, missingAmounts: 0 };
      groups.set(key, group);
    }
    const amount = row.estimateAmount === null ? null : new Prisma.Decimal(row.estimateAmount);
    if (amount !== null) { group.totalAmount = new Prisma.Decimal(group.totalAmount || 0).plus(amount).toFixed(2); total = total.plus(amount); recordedAmounts++; }
    else group.missingAmounts++;
    group.estimates.push({ id: row.id, estimateNumber: row.estimateNumber, estimateAmount: amount?.toFixed(2) ?? null, status: row.status, name: row.name, creationDate: row.creationDate?.toISOString() || null, approvalDate: row.approvalDate?.toISOString() || null });
  }
  const properties = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  const located = properties.filter(property => property.locationIssue === null);
  return {
    properties,
    summary: { opportunities: properties.reduce((sum, property) => sum + property.estimates.length, 0), properties: properties.length, locatedProperties: located.length, unlocatedProperties: properties.length - located.length, locatedOpportunities: located.reduce((sum, property) => sum + property.estimates.length, 0), totalAmount: recordedAmounts ? total.toFixed(2) : null, missingAmounts: properties.reduce((sum, property) => sum + property.missingAmounts, 0) },
    approvedStatuses: approvedOpportunityStatuses,
  };
}
