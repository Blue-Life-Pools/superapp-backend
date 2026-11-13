import { BadRequestException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { buildPropertyMatches, dateValue, moneyValue, normalizeOpportunity, opportunityFields, parseOpportunityCsv } from './opportunity-data';
import { OpportunitiesService } from './opportunities.service';
import { AutomationOpportunityDto, OpportunityInputDto, OpportunityQueryDto } from './opportunities.dto';
import { allowedAreas } from '../auth/auth.constants';

const headers = ['Title', 'Link Propiedad', 'N�mero Estimado', 'Valor estimado Bluelife', 'Estatus', 'Categorizaci�n', 'CONTRACTOR', 'Oportunity Name', 'Fecha de Creaci�n', 'Solicitado por', 'Fecha Aprobaci�n', 'Aprobado Por', 'Fecha de Reparaci�n Estimada', 'Skimmer', 'Tech Asignado', 'Fecha de Reparaci�n Real', '%23 Invoice', 'Valor de Invoice ', 'Fecha Invoice', 'Tiempo en ser aprobado', 'Tiempo en ser reparado', 'Tiempo en ser facturado'];
const sourceRow = ['Test property', 'Test property', '7108', '1,250.50', 'Pending', 'Filter,Plumbing', 'Blue Life', 'First line<br>Second line', '11/13/2026', 'Operations', '', '', '', 'False', '', '', '', '1.610', '', '0', '', ''];
const csv = (rows: string[][]) => Buffer.from([headers, ...rows].map(row => row.map(cell => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\r\n'));

describe('Opportunity source data', () => {
  it('preserves all 22 fields, blanks, zero values, categories and original source text', () => {
    const [row] = parseOpportunityCsv(csv([sourceRow]), 'source.csv');
    expect(opportunityFields.every(field => field in row)).toBe(true);
    expect(row).toMatchObject({ propertyName: 'Test property', estimateAmount: '1250.50', invoiceAmount: '1610', name: 'First line<br>Second line', inSkimmer: false, approvalDate: null, approvalTime: '0', categories: ['Filter', 'Plumbing'] });
    expect(row.sourceMetadata.original['Valor de Invoice ']).toBe('1.610');
    expect(row.creationDate).toEqual(new Date('2026-11-13T00:00:00.000Z'));
    const blank = [...sourceRow]; blank[2] = ''; blank[3] = ''; blank[8] = ''; blank[13] = '';
    expect(parseOpportunityCsv(csv([blank]), 'source.csv')[0]).toMatchObject({ estimateNumber: null, estimateAmount: null, creationDate: null, inSkimmer: null });
  });
  it('retains repeated estimate numbers and even identical rows as separate source records', () => {
    const another = [...sourceRow]; another[7] = 'Another job';
    const rows = parseOpportunityCsv(csv([sourceRow, another, sourceRow]), 'source.csv');
    expect(rows).toHaveLength(3); expect(new Set(rows.map(row => row.sourceRecordId)).size).toBe(3);
    expect(rows.every(row => row.estimateNumber === '7108')).toBe(true);
    expect(new Set(parseOpportunityCsv(csv([another, sourceRow, sourceRow]), 'renamed.csv').map(row => row.sourceRecordId))).toEqual(new Set(rows.map(row => row.sourceRecordId)));
  });
  it('validates dates and monetary precision without turning missing amounts into zero', () => {
    expect(dateValue('2/29/2024')).toEqual(new Date('2024-02-29T00:00:00Z'));
    expect(() => dateValue('2/29/2026')).toThrow(); expect(() => dateValue('2026-13-01')).toThrow();
    expect(moneyValue('')).toBeNull(); expect(moneyValue('0')).toBe('0');
    expect(moneyValue('6.288.50')).toBe('6288.50'); expect(moneyValue('2.743,70')).toBe('2743.70');
    expect(moneyValue('7,699.34')).toBe('7699.34'); expect(moneyValue('12.50')).toBe('12.50');
    expect(() => moneyValue('1.2345')).toThrow(); expect(() => moneyValue('not money')).toThrow();
    expect(() => normalizeOpportunity({ propertyName: '  ' })).toThrow();
    expect(normalizeOpportunity({ categories: '[]' })).toEqual({ categories: [] });
  });
  it('links only an unambiguous registered property and does not guess between different properties', () => {
    const match = buildPropertyMatches([{ id: 'a', name: '  Tést   Property' }, { id: 'b', name: 'Other property' }, { id: 'c', name: 'Duplicate' }, { id: 'd', name: 'Duplicate' }]);
    expect(match(['test property'])).toBe('a'); expect(match(['Unknown'])).toBeNull();
    expect(match(['Duplicate'])).toBeNull(); expect(match(['Test property', 'Other property'])).toBeNull();
  });
  it('rejects missing columns and reports the original CSV row when input is invalid', () => {
    expect(() => parseOpportunityCsv(Buffer.from('Title\nTest'), 'bad.csv')).toThrow('missing columns');
    const bad = [...sourceRow]; bad[8] = '2/31/2026'; expect(() => parseOpportunityCsv(csv([bad]), 'bad.csv')).toThrow('Row 2');
  });
});

describe('Opportunities service', () => {
  let service: OpportunitiesService, prisma: any, configuredKey: string | undefined;
  beforeEach(() => {
    configuredKey = undefined;
    prisma = { opportunity: { count: jest.fn().mockResolvedValue(2616), findMany: jest.fn().mockImplementation(async args => args.select.id ? [] : [{ status: 'Pending', propertyName: 'Test property', categories: ['Filter'], contractor: 'Blue Life', assignedTechnician: 'Jose' }]), groupBy: jest.fn().mockResolvedValue([{ status: 'Pending', _count: { _all: 638 } }, { status: 'Converted', _count: { _all: 1840 } }, { status: 'Accepted', _count: { _all: 79 } }, { status: null, _count: { _all: 2 } }]), findFirst: jest.fn(), findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockImplementation(async args => args.create), create: jest.fn(), update: jest.fn(), createMany: jest.fn() }, property: { findMany: jest.fn().mockResolvedValue([{ id: 'property-id', name: 'Test property' }]) } };
    prisma.$transaction = jest.fn(async callback => callback(prisma));
    service = new OpportunitiesService(prisma, { get: () => configuredKey } as unknown as ConfigService);
  });
  it('paginates the table while aggregating the full filtered dataset and retaining all facet values', async () => {
    const result = await service.list(Object.assign(new OpportunityQueryDto(), { page: 2, limit: 25, status: 'Pending', category: 'Filter', search: '7108', from: '2026-01-01', to: '2026-11-13' }));
    expect(result.total).toBe(2616); expect(result.page).toBe(2); expect(result.stats.pending).toBe(638); expect(result.stats.converted).toBe(1840);
    expect(prisma.opportunity.findMany.mock.calls[0][0]).toMatchObject({ skip: 25, take: 25, where: { status: 'Pending', categories: { has: 'Filter' }, creationDate: { gte: new Date('2026-01-01Z'), lte: new Date('2026-11-13Z') } } });
    expect(prisma.opportunity.groupBy.mock.calls[0][0].where.status).toBeUndefined(); expect(prisma.opportunity.groupBy.mock.calls[0][0].take).toBeUndefined();
    expect(result.facets.categories).toEqual(['Filter']);
    expect(prisma.opportunity.findMany.mock.calls[0][0].select.sourceMetadata).toBeUndefined();
  });
  it('clamps the final page and rejects reversed date ranges before querying', async () => {
    prisma.opportunity.count.mockResolvedValue(1); const result = await service.list(Object.assign(new OpportunityQueryDto(), { page: 99 })); expect(result.page).toBe(1);
    await expect(service.list(Object.assign(new OpportunityQueryDto(), { from: '2026-12-01', to: '2026-01-01' }))).rejects.toThrow(BadRequestException);
  });
  it('adds every source row atomically and makes a second CSV import a no-op', async () => {
    const seen = new Set<string>(); prisma.opportunity.createMany.mockImplementation(async ({ data }) => { let count = 0; for (const row of data) if (!seen.has(row.sourceRecordId)) { seen.add(row.sourceRecordId); count++; } return { count }; });
    const file = csv([sourceRow, sourceRow]);
    expect(await service.importCsv(file, 'source.csv')).toMatchObject({ rows: 2, inserted: 2, skipped: 0, matchedProperties: 2 });
    expect(await service.importCsv(file, 'source.csv')).toMatchObject({ inserted: 0, skipped: 2 });
    expect(prisma.opportunity.update).not.toHaveBeenCalled();
    expect(prisma.opportunity.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });
  it('updates only supplied fields so inline statuses cannot replace dates, amounts or repairs', async () => {
    prisma.opportunity.findFirst.mockResolvedValue({ id: 'id', propertyName: 'Test property', linkedPropertyName: null });
    await service.update('id', { status: 'Accepted' });
    expect(prisma.opportunity.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'Accepted' } }));
    await service.remove('id'); expect(prisma.opportunity.update.mock.calls[1][0].data.deletedAt).toBeInstanceOf(Date);
  });
  it('exports all matching rows and all 22 columns without a page limit', async () => {
    prisma.opportunity.findMany.mockResolvedValue([{ ...normalizeOpportunity(Object.fromEntries(opportunityFields.map((field, index) => [field, sourceRow[index]]))), id: 'id' }]);
    const result = await service.exportCsv(Object.assign(new OpportunityQueryDto(), { page: 88, limit: 25 }));
    expect(result).toContain('"Created / received date"'); expect(result).toContain('"1250.50"'); expect(result).toContain('"2026-11-13"');
    expect(prisma.opportunity.findMany.mock.calls[0][0].take).toBeUndefined(); expect(prisma.opportunity.findMany.mock.calls[0][0].skip).toBeUndefined();
  });
  it('fails closed without an intake key and rejects wrong keys or a different mailbox', async () => {
    const data = { propertyName: 'Test property', estimateNumber: '7200', externalId: 'message-1', mailbox: 'ximena.velosa@bluelifepools.com', receivedAt: '2026-11-14T02:15:00Z' };
    await expect(service.ingest(data, 'key')).rejects.toThrow(ServiceUnavailableException);
    configuredKey = 'test-intake-key'; await expect(service.ingest(data, 'wrong')).rejects.toThrow(UnauthorizedException);
    await expect(service.ingest({ ...data, mailbox: 'other@example.test' }, configuredKey)).rejects.toThrow(BadRequestException);
    expect(prisma.opportunity.upsert).not.toHaveBeenCalled();
  });
  it('uses the email receipt date and an external identity rather than the import time or estimate number', async () => {
    configuredKey = 'test-intake-key';
    const data = { propertyName: 'Test property', estimateNumber: '7200', externalId: 'message-1', mailbox: 'ximena.velosa@bluelifepools.com', receivedAt: '2026-11-14T02:15:00Z', creationDate: '2020-01-01' };
    await service.ingest(data, configuredKey); await service.ingest(data, configuredKey);
    const calls = prisma.opportunity.upsert.mock.calls;
    expect(calls[0][0].where).toEqual(calls[1][0].where);
    expect(calls[0][0].create).toMatchObject({ source: 'POWER_AUTOMATE', sourceRecordId: 'message-1', creationDate: new Date('2026-11-13T00:00:00Z'), receivedAt: new Date(data.receivedAt), propertyId: 'property-id', status: 'Pending' });
    prisma.opportunity.findUnique.mockResolvedValue({ id: 'id', deletedAt: new Date() });
    expect(await service.ingest(data, configuredKey)).toEqual({ id: 'id', skipped: true }); expect(prisma.opportunity.upsert).toHaveBeenCalledTimes(2);
  });
});

it('validates intake DTOs, pagination and scope without adding a new broad user role', async () => {
  expect(await validate(plainToInstance(OpportunityInputDto, { propertyName: 'Test property', estimateAmount: '1250.50' }))).toHaveLength(0);
  expect((await validate(plainToInstance(AutomationOpportunityDto, { propertyName: 'Test property' }))).length).toBeGreaterThan(0);
  expect((await validate(plainToInstance(OpportunityQueryDto, { page: '-1', sort: 'arbitrary SQL' }))).length).toBeGreaterThan(0);
  expect(allowedAreas('COMMERCIAL')).toContain('opportunities'); expect(allowedAreas('SUPER_ADMIN')).toContain('opportunities'); expect(allowedAreas('OPERATIONS_DIRECTOR')).toContain('opportunities'); expect(allowedAreas('QUALITY')).not.toContain('opportunities');
});
