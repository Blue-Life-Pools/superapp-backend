import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { PropertiesService } from './properties.service';

describe('Property service start date', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const validate = (serviceStartDate: unknown) => pipe.transform({ serviceStartDate }, { type: 'body', metatype: UpdatePropertyDto });
  it('accepts calendar dates and clearing, and rejects invalid dates and timestamps', async () => {
    expect(await validate('2026-11-16')).toMatchObject({ serviceStartDate: '2026-11-16' });
    expect(await validate('2024-02-29')).toMatchObject({ serviceStartDate: '2024-02-29' });
    expect(await validate(null)).toMatchObject({ serviceStartDate: null });
    for (const invalid of ['', '2026-02-30', '2026-02-29', '11/16/2026', '2026-11-16T05:00:00Z', 123]) await expect(validate(invalid)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('stores midnight UTC, clears with null, and preserves an omitted date', async () => {
    const prisma = { property: { findUnique: jest.fn().mockResolvedValue({ id: 'property', contacts: [], serviceStartDate: new Date('2025-07-20T00:00:00Z') }), update: jest.fn().mockResolvedValue({ id: 'property' }) } };
    const service = new PropertiesService(prisma as never, {} as never, {} as never);
    await service.update('property', { serviceStartDate: '2026-11-16' });
    expect(prisma.property.update).toHaveBeenLastCalledWith({ where: { id: 'property' }, data: { serviceStartDate: new Date('2026-11-16T00:00:00.000Z') } });
    await service.update('property', { serviceStartDate: null });
    expect(prisma.property.update).toHaveBeenLastCalledWith({ where: { id: 'property' }, data: { serviceStartDate: null } });
    await service.update('property', { leadSource: 'ROUTE' });
    expect(prisma.property.update).toHaveBeenLastCalledWith({ where: { id: 'property' }, data: { leadSource: 'ROUTE' } });
  });
  it('also saves the date when the property form submits related water bodies', async () => {
    const tx = { property: { update: jest.fn() }, waterBody: { deleteMany: jest.fn(), createMany: jest.fn() } };
    const prisma = { property: { findUnique: jest.fn().mockResolvedValue({ id: 'property', contacts: [] }) }, $transaction: jest.fn(async callback => callback(tx)) };
    const service = new PropertiesService(prisma as never, {} as never, {} as never);
    jest.spyOn(service, 'provisionSharePointFolder').mockResolvedValue({} as never);
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'property' } as never);
    await service.update('property', { serviceStartDate: '2026-01-01', waterBodies: [] });
    expect(tx.property.update).toHaveBeenCalledWith({ where: { id: 'property' }, data: { serviceStartDate: new Date('2026-01-01T00:00:00.000Z') } });
  });
});
