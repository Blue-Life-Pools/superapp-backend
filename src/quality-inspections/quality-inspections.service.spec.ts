import { NotFoundException } from '@nestjs/common';
import { QualityInspectionsService } from './quality-inspections.service';
import { PrismaService } from '../prisma/prisma.service';

describe('Quality inspection transfer limits', () => {
  const finding = { id: 'finding-1', title: 'Chemical readings alert', requiresEstimate: true, status: 'OPEN', resolvedByName: null, resolutionUpdatedByName: null };
  let prisma: { qualityInspection: { findMany: jest.Mock; findUnique: jest.Mock }; qualityFinding: { findUnique: jest.Mock; update: jest.Mock } };
  let service: QualityInspectionsService;
  beforeEach(() => {
    prisma = { qualityInspection: { findMany: jest.fn().mockResolvedValue([{ id: 'visit-1', findings: [finding] }]), findUnique: jest.fn() }, qualityFinding: { findUnique: jest.fn().mockResolvedValue(finding), update: jest.fn().mockResolvedValue(finding) } };
    service = new QualityInspectionsService(prisma as unknown as PrismaService);
  });
  it('does not select inspection or finding photos in the directory', async () => {
    const result = await service.list();
    const query = prisma.qualityInspection.findMany.mock.calls[0][0];
    expect(query.include).toBeUndefined();
    expect(query.select.photos).toBeUndefined();
    expect(query.select.findings.select.photos).toBeUndefined();
    expect(query.select.readings).toBe(true);
    expect(query.select.findings.select.resolvedByName).toBe(true);
    expect(result[0].findings[0].requiresEstimate).toBe(false);
  });
  it('filters at the database rather than downloading other properties', async () => {
    await service.list('property-1');
    expect(prisma.qualityInspection.findMany.mock.calls[0][0].where).toEqual({ propertyId: 'property-1' });
  });
  it('loads only finding photo fields on demand', async () => {
    const photos = { id: 'visit-1', findings: [{ id: 'finding-1', photos: [{ name: 'photo.jpg', data: 'data:image/jpeg;base64,photo' }] }] };
    prisma.qualityInspection.findUnique.mockResolvedValue(photos);
    expect(await service.photos('visit-1')).toEqual(photos);
    expect(prisma.qualityInspection.findUnique).toHaveBeenCalledWith({ where: { id: 'visit-1' }, select: { id: true, findings: { select: { id: true, photos: true } } } });
  });
  it('keeps full photos available for expanding and editing a visit', async () => {
    prisma.qualityInspection.findUnique.mockResolvedValue({ id: 'visit-1', photos: ['visit-photo'], findings: [{ ...finding, photos: ['finding-photo'] }] });
    const result = await service.detail('visit-1');
    expect(result.photos).toEqual(['visit-photo']);
    expect(result.findings[0].photos).toEqual(['finding-photo']);
  });
  it('does not read or return photos when changing a finding status', async () => {
    await service.updateFinding('finding-1', { status: 'RESOLVED', resolution: 'Completed' }, 'Ximena');
    expect(prisma.qualityFinding.findUnique.mock.calls[0][0].select.photos).toBeUndefined();
    const query = prisma.qualityFinding.update.mock.calls[0][0];
    expect(query.select.photos).toBeUndefined();
    expect(query.data.resolvedByName).toBe('Ximena');
    expect(query.data.resolutionUpdatedByName).toBe('Ximena');
  });
  it('rejects a missing photo inspection', async () => {
    prisma.qualityInspection.findUnique.mockResolvedValue(null);
    await expect(service.photos('missing')).rejects.toThrow(NotFoundException);
  });
});
