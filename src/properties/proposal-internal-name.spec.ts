import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PropertiesService } from './properties.service';
import { UpdateSalesActivityDto } from './dto/update-sales-activity.dto';
import { withInternalProposalName } from './proposal-internal-name';

describe('Internal proposal names', () => {
  const snapshot = { proposalNumber: 'BL-2026-EXAMPLE', totalMonthlyInvestment: 850, waterBodies: [{ description: 'Pool', baseMonthlyCost: 700 }, { description: 'Fountain', baseMonthlyCost: 150 }], pricingModel: { totalCost: 301.2 }, internalName: 'Original' };
  function setup(data: unknown = snapshot) {
    const prisma = { property: { findFirst: jest.fn().mockResolvedValue({ id: 'property' }) }, salesActivity: { findFirst: jest.fn().mockResolvedValue({ id: 'proposal', propertyId: 'property', notes: 'Existing email text', proposalData: data }), update: jest.fn().mockResolvedValue({ id: 'proposal' }), create: jest.fn().mockResolvedValue({ id: 'proposal' }) } };
    return { prisma, service: new PropertiesService(prisma as never, {} as never, {} as never) };
  }
  it('renames an existing proposal without replacing its financial snapshot or email text', async () => {
    const { service, prisma } = setup();
    await service.updateSalesActivity('property', 'proposal', { internalName: '  Renewal 2027  ' });
    expect(prisma.salesActivity.findFirst).toHaveBeenCalledWith({ where: { id: 'proposal', propertyId: 'property' } });
    expect(prisma.salesActivity.update).toHaveBeenCalledWith(expect.objectContaining({ data: { proposalData: { ...snapshot, internalName: 'Renewal 2027' } } }));
    await service.updateSalesActivity('property', 'proposal', { notes: 'Updated email text' });
    expect(prisma.salesActivity.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { notes: 'Updated email text' } }));
    await service.updateSalesActivity('property', 'proposal', { internalName: ' ' });
    expect(prisma.salesActivity.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { proposalData: { ...snapshot, internalName: null } } }));
  });
  it('saves names on creation and supports legacy proposals without metadata', async () => {
    const { service, prisma } = setup(null);
    await service.createSalesActivity('property', { type: 'PROPOSAL', notes: 'Email text', proposalData: { ...snapshot, internalName: '  Pool and fountain  ' } });
    expect(prisma.salesActivity.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ proposalData: { ...snapshot, internalName: 'Pool and fountain' } }) }));
    await service.updateSalesActivity('property', 'proposal', { internalName: 'Legacy quote' });
    expect(prisma.salesActivity.update).toHaveBeenCalledWith(expect.objectContaining({ data: { proposalData: { internalName: 'Legacy quote' } } }));
  });
  it('validates names and rejects updates for a different property', async () => {
    expect(() => withInternalProposalName(snapshot, { unexpected: true })).toThrow(BadRequestException);
    expect(() => withInternalProposalName(snapshot, 'x'.repeat(121))).toThrow(BadRequestException);
    expect(await validate(plainToInstance(UpdateSalesActivityDto, { internalName: 'x'.repeat(121) }))).toHaveLength(1);
    expect(await validate(plainToInstance(UpdateSalesActivityDto, { internalName: '  Valid name  ' }))).toHaveLength(0);
    const { service, prisma } = setup();
    prisma.salesActivity.findFirst.mockResolvedValue(null);
    await expect(service.updateSalesActivity('other-property', 'proposal', { internalName: 'No change' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.salesActivity.update).not.toHaveBeenCalled();
  });
});
