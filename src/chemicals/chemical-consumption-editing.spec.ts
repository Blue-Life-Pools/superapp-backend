import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ChemicalConsumptionService } from './chemical-consumption.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateConsumptionChemicalsDto, UpdateConsumptionTechnicianDto, UpdateConsumptionWaterBodiesDto } from './dto/chemical-consumption.dto';

describe('Property consumption editing', () => {
  const body = { id: 'pool', name: 'Pool', type: 'POOL', size: 'MEDIUM', gallons: 47000, active: true, technicianName: null };
  const property = { id: 'property', name: 'Example', code: 'EXAMPLE', waterBodies: [body] };
  const chemical = { name: 'Liquid Chlorine', unit: 'GAL', quantity: 10, cost: 20, technicians: [{ name: 'Alex', quantity: 5, cost: 10 }, { name: 'Alex', quantity: 5, cost: 10 }] };
  function setup() {
    const records = ['2026-09', '2026-10'].map(month => ({ propertyId: property.id, month, property: structuredClone(property), chemicals: [structuredClone(chemical)], monthlyFee: 100, sourceName: 'skimmer.pdf', feeSource: 'fees.xlsx', budgetPercent: 22, seasonFactor: 1.3, references: [] as unknown[], technicianOverride: null as string | null }));
    const prisma = {
      property: { findFirst: jest.fn().mockResolvedValue(structuredClone(property)), findMany: jest.fn().mockResolvedValue([property]) },
      chemicalConsumptionHistory: { findMany: jest.fn().mockResolvedValue([]) },
      chemicalConsumptionPeriod: {
        findUnique: jest.fn().mockResolvedValue({ sourceName: 'skimmer.pdf' }),
        upsert: jest.fn().mockImplementation(async ({ where, update }) => {
          const record = records.find(row => row.propertyId === where.propertyId_month.propertyId && row.month === where.propertyId_month.month)!;
          return Object.assign(record, update);
        }),
      },
      waterBody: { update: jest.fn().mockResolvedValue(body), create: jest.fn().mockResolvedValue({ ...body, id: 'new-body' }) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(async callback => callback(prisma));
    return { prisma, records, service: new ChemicalConsumptionService(prisma as unknown as PrismaService) };
  }

  it('updates one month, recalculates totals, percentage and allocation, and preserves usage occurrences and settings', async () => {
    const { service, records } = setup();
    const result = await service.updateChemicals(property.id, '2026-10', { chemicals: [{ ...chemical, cost: 30, technicians: chemical.technicians.map(entry => ({ ...entry, cost: 15 })) }], monthlyFee: 200 });
    expect(result.totalCost).toBe(30);
    expect(result.costPercent).toBe(15);
    expect(result.allocation.bodies[0].chemicalCost).toBe(30);
    expect(result.allocation.bodies[0].monthlyFee).toBe(200);
    expect(result.chemicals[0].technicians).toHaveLength(2);
    expect(result).toMatchObject({ sourceName: 'skimmer.pdf', feeSource: 'MANUAL', budgetPercent: 22, seasonFactor: 1.3 });
    expect(records[0]).toMatchObject({ monthlyFee: 100, chemicals: [chemical] });
  });

  it('rejects invalid attribution and duplicate chemicals before writing', async () => {
    const { service, prisma } = setup();
    await expect(service.updateChemicals(property.id, '2026-10', { chemicals: [{ ...chemical, quantity: 1 }] })).rejects.toThrow('quantities exceed');
    await expect(service.updateChemicals(property.id, '2026-10', { chemicals: [{ ...chemical, cost: 1 }] })).rejects.toThrow('costs exceed');
    await expect(service.updateChemicals(property.id, '2026-10', { chemicals: [chemical, { ...chemical, name: ' liquid chlorine ' }] })).rejects.toThrow('duplicate');
    expect(prisma.chemicalConsumptionPeriod.upsert).not.toHaveBeenCalled();
  });

  it('sets and clears a monthly technician override without rewriting actual usage or adjacent months', async () => {
    const { service, records, prisma } = setup();
    const result = await service.updateTechnician(property.id, '2026-10', { technicianOverride: '  Jose Lugo  ' });
    expect(result.technicianOverride).toBe('Jose Lugo');
    expect(result.chemicals[0].technicians).toEqual(chemical.technicians);
    expect(records[0].technicianOverride).toBeNull();
    expect(prisma.chemicalConsumptionPeriod.upsert.mock.calls[0][0].update).toEqual({ technicianOverride: 'Jose Lugo' });
    expect((await service.updateTechnician(property.id, '2026-10', { technicianOverride: null })).technicianOverride).toBeNull();
  });

  it('keeps existing water body IDs and inactive history, and creates only new bodies', async () => {
    const { service, prisma } = setup();
    await service.updateWaterBodies(property.id, { waterBodies: [{ ...body, gallons: 50000, active: false }, { name: 'Fountain', type: 'FOUNTAIN', active: true }] });
    expect(prisma.waterBody.update).toHaveBeenCalledWith({ where: { id: body.id }, data: expect.objectContaining({ gallons: 50000, active: false }) });
    expect(prisma.waterBody.create).toHaveBeenCalledTimes(1);
    expect(prisma.waterBody.create.mock.calls[0][0].data).toMatchObject({ propertyId: property.id, name: 'Fountain', gallons: null });
  });

  it('rejects foreign and duplicate water body IDs before any mutation', async () => {
    const { service, prisma } = setup();
    await expect(service.updateWaterBodies(property.id, { waterBodies: [{ ...body, id: 'foreign' }] })).rejects.toThrow('does not belong');
    await expect(service.updateWaterBodies(property.id, { waterBodies: [body, body] })).rejects.toThrow('more than once');
    expect(prisma.waterBody.update).not.toHaveBeenCalled();
    expect(prisma.waterBody.create).not.toHaveBeenCalled();
  });

  it('rejects invalid months and missing properties', async () => {
    const { service, prisma } = setup();
    await expect(service.updateTechnician(property.id, 'all', { technicianOverride: null })).rejects.toThrow('valid month');
    prisma.property.findFirst.mockResolvedValue(null);
    await expect(service.updateChemicals('missing', '2026-10', { chemicals: [] })).rejects.toThrow('Property not found');
    expect(prisma.chemicalConsumptionPeriod.upsert).not.toHaveBeenCalled();
  });
});

describe('Consumption edit input validation', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const parse = (metatype: new () => unknown, data: unknown) => pipe.transform(data, { type: 'body', metatype });
  it('accepts clearing a manual technician and unknown volumes without losing body IDs', async () => {
    expect(await parse(UpdateConsumptionTechnicianDto, { technicianOverride: null })).toMatchObject({ technicianOverride: null });
    const data = await parse(UpdateConsumptionWaterBodiesDto, { waterBodies: [{ id: '44b426de-38a6-4587-847a-29f990a7d0d3', name: 'Pool', type: 'POOL', gallons: null, size: null, technicianName: null, active: false }] });
    expect(data.waterBodies[0]).toMatchObject({ id: '44b426de-38a6-4587-847a-29f990a7d0d3', active: false });
  });
  it('rejects negative costs, null fees, fractional gallons, missing technician values and unexpected fields', async () => {
    await expect(parse(UpdateConsumptionChemicalsDto, { chemicals: [{ name: 'Chlorine', unit: 'GAL', quantity: 2, cost: -1 }] })).rejects.toThrow();
    await expect(parse(UpdateConsumptionChemicalsDto, { chemicals: [], monthlyFee: null })).rejects.toThrow();
    await expect(parse(UpdateConsumptionWaterBodiesDto, { waterBodies: [{ name: 'Pool', type: 'POOL', gallons: 1.5 }] })).rejects.toThrow();
    await expect(parse(UpdateConsumptionTechnicianDto, {})).rejects.toThrow();
    await expect(parse(UpdateConsumptionTechnicianDto, { technicianOverride: 'Alex', monthlyFee: 100 })).rejects.toThrow();
  });
});
