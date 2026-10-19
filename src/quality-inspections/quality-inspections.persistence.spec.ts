import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { QualityInspectionsService } from './quality-inspections.service';
import { UpdateQualityFindingDto, UpsertQualityInspectionDto } from './dto/upsert-quality-inspection.dto';

const inspectionId = '10000000-0000-4000-8000-000000000001';
const findingId = '10000000-0000-4000-8000-000000000002';
const propertyId = '10000000-0000-4000-8000-000000000003';
describe('Quality edits persist without losing follow-up', () => {
  let service: QualityInspectionsService;
  let findings: Map<string, any>;
  let tx: any;
  const input = (extra: Partial<UpsertQualityInspectionDto> = {}): UpsertQualityInspectionDto => ({ propertyId, technicianName: 'Updated technician', visitDate: '2026-09-18T15:00:00Z', ...extra });
  beforeEach(() => {
    findings = new Map([[findingId, { id: findingId, inspectionId, title: 'Chemical readings alert', description: 'Old description', severity: 'HIGH', status: 'RESOLVED', requiresEstimate: false, responsibleName: 'Supervisor', resolution: 'Completed', resolvedAt: new Date('2026-09-20T12:00:00Z'), resolvedByName: 'Original resolver', resolutionUpdatedByName: 'Original author', estimateNumber: 'E-123', estimateSentAt: new Date('2026-09-19T12:00:00Z'), photos: [{ name: 'existing.jpg', data: 'image' }] }]]);
    const inspection: any = { id: inspectionId, propertyId, photos: ['visit-photo'] };
    tx = {
      qualityInspection: { findUnique: jest.fn().mockResolvedValue({ id: inspectionId }), update: jest.fn(async ({ data }) => Object.assign(inspection, data)) },
      qualityFinding: {
        findMany: jest.fn(async () => [...findings.values()]),
        deleteMany: jest.fn(async ({ where }) => { for (const [id] of findings) if (!where.id.notIn.includes(id)) findings.delete(id); }),
        update: jest.fn(async ({ where, data }) => { const result = { ...findings.get(where.id), ...data }; findings.set(where.id, result); return result; }),
        create: jest.fn(async ({ data }) => { const result = { id: 'new-finding', ...data }; findings.set(result.id, result); return result; }),
      },
    };
    const prisma = {
      property: { findFirst: jest.fn().mockResolvedValue({ id: propertyId }) },
      qualityInspection: { findUnique: jest.fn(async () => ({ ...inspection, findings: [...findings.values()] })), findMany: jest.fn(async () => [{ ...inspection, findings: [...findings.values()] }]) },
      qualityFinding: { findUnique: jest.fn(async ({ where }) => findings.get(where.id)), update: tx.qualityFinding.update },
      $transaction: jest.fn(async (callback) => callback(tx)),
    };
    service = new QualityInspectionsService(prisma as never);
  });
  it('keeps estimate edits after saving, reopening and listing a chemical alert', async () => {
    await service.update(inspectionId, input({ findings: [{ id: findingId, description: 'Edited description', requiresEstimate: true }] }));
    const reopened = await service.detail(inspectionId);
    expect(reopened.findings[0]).toMatchObject({ id: findingId, description: 'Edited description', requiresEstimate: true, status: 'RESOLVED', resolvedByName: 'Original resolver', resolutionUpdatedByName: 'Original author', responsibleName: 'Supervisor', estimateNumber: 'E-123', photos: [{ name: 'existing.jpg', data: 'image' }] });
    expect((await service.list())[0].findings[0].requiresEstimate).toBe(true);
    expect(tx.qualityFinding.update.mock.calls[0][0].data.photos).toBeUndefined();
    expect(tx.qualityFinding.create).not.toHaveBeenCalled();
    await service.update(inspectionId, input({ findings: [{ id: findingId, description: 'Edited description', requiresEstimate: false }] }));
    expect((await service.detail(inspectionId)).findings[0].requiresEstimate).toBe(false);
  });
  it('honors an explicitly requested estimate when creating a chemical alert', async () => {
    const create = jest.fn().mockResolvedValue({ id: inspectionId });
    const creator = new QualityInspectionsService({ property: { findFirst: jest.fn().mockResolvedValue({ id: propertyId }) }, qualityInspection: { create } } as never);
    await creator.create(input({ findings: [{ title: 'Chemical readings alert', description: 'Needs follow-up', requiresEstimate: true }] }));
    expect(create.mock.calls[0][0].data.findings.create[0].requiresEstimate).toBe(true);
  });
  it('saves explicitly changed photos without clearing inspection photos', async () => {
    const result = await service.update(inspectionId, input({ findings: [{ id: findingId, description: 'With new photo', photos: [{ name: 'new.jpg', type: 'image/jpeg', data: 'new' }] }] }));
    expect(result.findings[0].photos).toEqual([{ name: 'new.jpg', type: 'image/jpeg', data: 'new' }]);
    expect(result.photos).toEqual(['visit-photo']);
  });
  it('preserves findings if the update does not include a findings array', async () => {
    await service.update(inspectionId, input());
    expect(findings.size).toBe(1);
    expect(tx.qualityFinding.deleteMany).not.toHaveBeenCalled();
  });
  it('rejects another inspection finding or duplicate IDs before deleting anything', async () => {
    for (const ids of [['other-finding'], [findingId, findingId]]) {
      await expect(service.update(inspectionId, input({ findings: ids.map((id) => ({ id, description: 'Test' })) }))).rejects.toThrow(BadRequestException);
    }
    expect(tx.qualityFinding.deleteMany).not.toHaveBeenCalled();
    expect(tx.qualityFinding.update).not.toHaveBeenCalled();
  });
  it('keeps estimates, responsible person and resolution on status-only changes', async () => {
    await service.updateFinding(findingId, { status: 'IN_PROGRESS' }, 'User');
    expect(findings.get(findingId)).toMatchObject({ resolution: 'Completed', responsibleName: 'Supervisor', estimateNumber: 'E-123' });
    await service.updateFinding(findingId, { status: 'RESOLVED', requiresEstimate: true }, 'User');
    expect(findings.get(findingId).requiresEstimate).toBe(true);
  });
  it('accepts an estimate flag through the real DTO validation and rejects response-only fields', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    const payload = { status: 'RESOLVED', requiresEstimate: true, estimateNumber: 'E-123' };
    expect(await pipe.transform(payload, { type: 'body', metatype: UpdateQualityFindingDto })).toMatchObject(payload);
    const full = input({ findings: [{ id: findingId, description: 'Edited', requiresEstimate: true, resolution: undefined }] });
    expect(await pipe.transform(full, { type: 'body', metatype: UpsertQualityInspectionDto })).toMatchObject({ findings: [{ requiresEstimate: true }] });
    await expect(pipe.transform({ ...full, findings: [{ ...full.findings![0], inspectionId }] }, { type: 'body', metatype: UpsertQualityInspectionDto })).rejects.toThrow(BadRequestException);
  });
});
