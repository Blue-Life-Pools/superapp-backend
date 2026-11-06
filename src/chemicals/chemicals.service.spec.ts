import { BadRequestException, UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { ChemicalsService } from './chemicals.service';
import { CreateChemicalReportDto } from './dto/create-chemical-report.dto';

function reportData(): CreateChemicalReportDto {
  return {
    serviceDate: '2026-09-10',
    technicianName: 'Test Technician',
    tabsQuantity: 1,
    tabsUnit: 'pounds',
    liquidChlorineGallons: 2.5,
    chlorinePowderScoops: 0,
    muriaticAcidGallons: 0,
    shockScoops: 0,
    dePowderBags: 0,
    dePowderUnit: 'scoops',
    bicarbonateScoops: 0,
    stabilizerScoops: 0,
    stabilizerUnit: 'bags',
    saltBags: 0,
    phosphatesOunces: 0,
  };
}

describe('ChemicalsService', () => {
  const create = jest.fn();
  const update = jest.fn();
  const findMany = jest.fn();
  const findFirst = jest.fn();
  const findReport = jest.fn();
  const findTechnician = jest.fn();
  const findTechnicians = jest.fn();
  const findAppSession = jest.fn();
  const findOwnerSession = jest.fn();
  const prisma = {
    chemicalReport: { create, findMany, findFirst: findReport, update },
    chemicalTechnician: {
      findFirst: findTechnician,
      findMany: findTechnicians,
    },
    appSession: { findUnique: findAppSession },
    chemicalOwnerSession: { findUnique: findOwnerSession },
    property: { findFirst },
  } as unknown as PrismaService;
  const service = new ChemicalsService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    findReport.mockReset();
    findMany.mockResolvedValue([]);
    findAppSession.mockResolvedValue(null);
    create.mockResolvedValue({});
  });

  it('includes the whole selected month even when newer records exceed the history limit', async () => {
    const october = ['2026-10-01T00:00:00.000Z', '2026-10-15T12:00:00.000Z', '2026-10-31T23:59:59.999Z'].map((date, id) => ({ id: `oct-${id}`, serviceDate: new Date(date), deletedAt: null }));
    const history = [...Array.from({ length: 600 }, (_, id) => ({ id: `nov-${id}`, serviceDate: new Date('2026-11-01T00:00:00.000Z'), deletedAt: null })), ...october, { id: 'deleted', serviceDate: new Date('2026-10-10'), deletedAt: new Date() }, { id: 'sep', serviceDate: new Date('2026-09-30T23:59:59.999Z'), deletedAt: null }];
    findMany.mockImplementation(async ({ where, take }) => {
      const result = history.filter((row) => !row.deletedAt && (!where.serviceDate || (row.serviceDate >= where.serviceDate.gte && row.serviceDate < where.serviceDate.lt)));
      return take === undefined ? result : result.slice(0, take);
    });
    expect(await service.findAll('2026-10')).toEqual(october);
    expect(await service.findAll()).toHaveLength(500);
  });

  it('rejects invalid monthly report ranges', () => {
    for (const month of ['2026-00', '2026-13', '2026-1', 'October', '2026-10-01']) {
      expect(() => service.findAll(month)).toThrow(BadRequestException);
    }
    expect(findMany).not.toHaveBeenCalled();
  });

  it('keeps the last day of December in its selected year', async () => {
    await service.findAll('2026-12');
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { deletedAt: null, serviceDate: { gte: new Date('2026-12-01'), lt: new Date('2027-01-01') } } }));
  });

  it('rejects a report without chemical quantities', async () => {
    const data = reportData();
    data.tabsQuantity = 0;
    data.liquidChlorineGallons = 0;

    await expect(service.create(data)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('stores chemical quantities without property or water body data', async () => {
    const data = reportData();
    await service.create(data);

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tabsQuantity: 1,
        tabsUnit: 'pounds',
        liquidChlorineGallons: 2.5,
        dePowderUnit: 'scoops',
        stabilizerUnit: 'bags',
      }),
    });
  });

  it('stores a warehouse withdrawal', async () => {
    const data = reportData();
    await service.create(data);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        serviceDate: expect.any(Date),
        technicianName: 'Test Technician',
        deletedAt: null,
      },
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        technicianName: 'Test Technician',
        tabsQuantity: 1,
      }),
    });
  });

  it('rejects a second report for the same technician and date', async () => {
    findMany.mockResolvedValue([reportData()]);

    await expect(service.create(reportData())).rejects.toThrow(
      'Este registro ya fue guardado anteriormente para ese técnico y fecha.',
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('uses the technician associated with the shared token', async () => {
    const data = reportData();
    data.technicianName = 'Incorrect Technician';
    data.technicianToken = '00000000-0000-4000-8000-000000000003';
    findTechnician.mockResolvedValue({ name: 'Assigned Technician' });
    await service.create(data);

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        technicianName: 'Assigned Technician',
      }),
    });
  });

  it('builds a private-token form link for the technician WhatsApp number', async () => {
    const shareToken = '00000000-0000-4000-8000-000000000004';
    findTechnician.mockResolvedValue({
      name: '01 Assigned Technician',
      whatsappNumber: '15551234567',
      shareToken,
    });

    const result = await service.technicianWhatsAppUrl(
      '00000000-0000-4000-8000-000000000005',
      'https://app.example.com/?area=chemicals',
    );
    const whatsappUrl = new URL(result);
    const message = whatsappUrl.searchParams.get('text') ?? '';

    expect(whatsappUrl.pathname).toBe('/15551234567');
    expect(message).toContain(`technicianToken=${shareToken}`);
    expect(message).toContain('Hola Assigned');
    expect(message).not.toContain('Hola 01');
  });

  it('recognizes a technician name without depending on case or accents', async () => {
    const shareToken = '00000000-0000-4000-8000-000000000006';
    findTechnicians.mockResolvedValue([{ name: '01 Ángel Viña', shareToken }]);

    await expect(service.accessTechnician('angel vina')).resolves.toEqual({
      name: '01 Ángel Viña',
      technicianToken: shareToken,
    });
  });

  it('rejects report deletion without an owner session', async () => {
    await expect(service.remove('report-id')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(findReport).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('soft deletes a report with the authenticated owner email', async () => {
    findOwnerSession.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
      owner: {
        active: true,
        name: 'Ximena',
        email: 'ximenam@bluelifepools.com',
      },
    });
    findReport.mockResolvedValue({ id: 'report-id' });
    update.mockResolvedValue({ id: 'report-id' });

    await service.remove('report-id', 'Bearer private-owner-token');

    expect(update).toHaveBeenCalledWith({
      where: { id: 'report-id' },
      data: {
        deletedAt: expect.any(Date),
        deletedByEmail: 'ximenam@bluelifepools.com',
      },
      select: { id: true },
    });
  });
});
