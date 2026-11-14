import { OpportunitiesService } from './opportunities.service';
import { OpportunityQueryDto } from './opportunities.dto';
import { buildApprovedOpportunityMap, type ApprovedMapRow } from './opportunity-map';

const property = (id = 'property-1') => ({ id, name: 'Example Apartments', addressLine1: '123 Example Street', city: 'Tampa', state: 'FL', zipCode: '33612', formattedAddress: null, latitude: '28.05', longitude: '-82.42', deletedAt: null });
const row = (data: Partial<ApprovedMapRow> = {}): ApprovedMapRow => ({ id: 'estimate-1', propertyId: 'property-1', propertyName: 'EXAMPLE APARTMENTS', linkedPropertyName: 'Example Apartments', estimateNumber: '7400', estimateAmount: '1250.50', status: 'Accepted', name: 'Replace pool motor', creationDate: new Date('2026-11-13'), approvalDate: null, property: property(), ...data });
describe('Approved opportunities map', () => {
  it('groups every approved estimate by property and sums known values without floating-point error', () => {
    const result = buildApprovedOpportunityMap([row({ estimateAmount: '0.10' }), row({ id: 'second', estimateAmount: '0.20', status: 'Approved' }), row({ id: 'pending', status: 'Pending' }), row({ id: 'converted', status: 'Converted' })]);
    expect(result.summary).toMatchObject({ opportunities: 2, properties: 1, locatedProperties: 1, totalAmount: '0.30' });
    expect(result.properties[0]).toMatchObject({ address: '123 Example Street, Tampa, FL 33612', latitude: 28.05, longitude: -82.42, totalAmount: '0.30' });
    expect(result.properties[0].estimates.map(item => item.id)).toEqual(['estimate-1', 'second']);
  });
  it('retains properties without a link, address or coordinates and does not invent a pin', () => {
    const result = buildApprovedOpportunityMap([
      row({ property: null, propertyId: null }),
      row({ id: 'missing-coordinates', property: { ...property('property-2'), latitude: null } }),
      row({ id: 'missing-address', property: { ...property('property-3'), addressLine1: null, latitude: null, longitude: null } }),
      row({ id: 'deleted-property', propertyName: 'Archived property', property: { ...property('deleted'), deletedAt: new Date() } }),
    ]);
    expect(result.summary).toMatchObject({ opportunities: 4, locatedProperties: 0, unlocatedProperties: 4 });
    expect(result.properties.every(item => item.latitude === null && item.longitude === null)).toBe(true);
    expect(result.properties.map(item => item.locationIssue).sort()).toEqual(['ADDRESS_MISSING', 'COORDINATES_MISSING', 'PROPERTY_NOT_LINKED', 'PROPERTY_NOT_LINKED']);
    expect(result.properties.find(item => item.name === 'Archived property')?.address).toBeNull();
  });
  it('keeps missing amounts distinct from a real zero, and rejects invalid coordinate ranges', () => {
    const result = buildApprovedOpportunityMap([row({ estimateAmount: null, property: { ...property(), latitude: '91' } }), row({ id: 'zero', property: property('property-2'), estimateAmount: '0.00' })]);
    expect(result.summary).toMatchObject({ totalAmount: '0.00', missingAmounts: 1, locatedProperties: 1 });
    expect(result.properties.find(item => item.id === 'property-1')).toMatchObject({ totalAmount: null, latitude: null });
  });
  it('reads the complete filtered set regardless of table pagination and keeps endpoint data limited', async () => {
    const db: any = { opportunity: { findMany: jest.fn().mockResolvedValue(Array.from({ length: 79 }, (_, i) => row({ id: String(i) }))) } };
    const service = new OpportunitiesService(db, {} as any);
    const result = await service.approvedMap(Object.assign(new OpportunityQueryDto(), { page: 4, limit: 25, category: 'Motor', from: '2026-01-01', property: 'EXAMPLE APARTMENTS' }));
    expect(result.summary.opportunities).toBe(79);
    const args = db.opportunity.findMany.mock.calls[0][0];
    expect(args.skip).toBeUndefined(); expect(args.take).toBeUndefined();
    expect(args.where.AND[0]).toMatchObject({ propertyName: 'EXAMPLE APARTMENTS', categories: { has: 'Motor' }, creationDate: { gte: new Date('2026-01-01') } });
    expect(args.where.AND[1].OR).toHaveLength(2);
    expect(args.select.sourceMetadata).toBeUndefined();
    expect(args.select.property.select).toMatchObject({ latitude: true, longitude: true });
  });
});
