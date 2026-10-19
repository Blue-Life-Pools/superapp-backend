import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QualityFindingDto, UpdateQualityFindingDto, UpsertQualityInspectionDto } from './dto/upsert-quality-inspection.dto';

// Never read image JSON in directory queries: filtering it after findMany still
// transfers the images from Neon to the backend on every request.
const findingSummarySelect = {
  id: true, inspectionId: true, title: true, description: true, severity: true,
  status: true, responsibleName: true, requiresEstimate: true, resolution: true,
  resolvedAt: true, resolvedByName: true, resolutionUpdatedByName: true,
  estimateNumber: true, estimateSentAt: true, createdAt: true, updatedAt: true,
} as const;

@Injectable()
export class QualityInspectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(propertyId?: string) {
    const inspections = await this.prisma.qualityInspection.findMany({
      where: propertyId ? { propertyId } : undefined,
      select: {
        id: true, propertyId: true, waterBodyId: true, technicianName: true,
        visitDate: true, readings: true, dosages: true, notes: true,
        createdAt: true, updatedAt: true,
        property: { select: { id: true, name: true } },
        waterBody: { select: { id: true, name: true } },
        findings: { select: findingSummarySelect, orderBy: { createdAt: 'desc' } },
      },
      orderBy: { visitDate: 'desc' },
    });
    return inspections.map((inspection) => ({
      ...inspection,
      findings: inspection.findings.map((finding) => this.normalizeFinding(finding)),
    }));
  }

  async photos(id: string) {
    const inspection = await this.prisma.qualityInspection.findUnique({
      where: { id },
      select: { id: true, findings: { select: { id: true, photos: true } } },
    });
    if (!inspection) throw new NotFoundException('Quality inspection not found.');
    return inspection;
  }

  async detail(id: string) {
    const inspection = await this.prisma.qualityInspection.findUnique({
      where: { id },
      include: { property: { select: { id: true, name: true } }, waterBody: { select: { id: true, name: true } }, findings: { orderBy: { createdAt: 'desc' } } },
    });
    if (!inspection) throw new NotFoundException('Quality inspection not found.');
    return {
      ...inspection,
      findings: inspection.findings.map((finding) => this.normalizeFinding(finding)),
    };
  }

  async create(data: UpsertQualityInspectionDto) {
    await this.ensureRelations(data.propertyId, data.waterBodyId);
    return this.prisma.qualityInspection.create({
      data: { propertyId: data.propertyId, waterBodyId: data.waterBodyId || null, technicianName: data.technicianName.trim(), visitDate: new Date(data.visitDate), readings: data.readings, dosages: data.dosages, notes: data.notes?.trim() || null, photos: data.photos || [], findings: { create: (data.findings || []).map((finding) => { const title = finding.title?.trim() || 'Finding'; return { title, description: finding.description.trim(), severity: finding.severity || 'MEDIUM', status: finding.status || 'OPEN', responsibleName: finding.responsibleName?.trim() || null, requiresEstimate: finding.requiresEstimate ?? false, resolution: finding.resolution?.trim() || null, resolvedAt: finding.resolvedAt ? new Date(finding.resolvedAt) : null, estimateNumber: finding.estimateNumber?.trim() || null, estimateSentAt: finding.estimateSentAt ? new Date(finding.estimateSentAt) : null, photos: finding.photos || [] }; }) } },
      include: { property: { select: { id: true, name: true } }, waterBody: { select: { id: true, name: true } }, findings: true },
    });
  }

  async update(id: string, data: UpsertQualityInspectionDto) {
    await this.ensureRelations(data.propertyId, data.waterBodyId);
    await this.prisma.$transaction(async (transaction) => {
      const inspection = await transaction.qualityInspection.findUnique({ where: { id }, select: { id: true } });
      if (!inspection) throw new NotFoundException('Quality inspection not found.');
      const existing = await transaction.qualityFinding.findMany({ where: { inspectionId: id }, select: findingSummarySelect });
      if (data.findings !== undefined) {
        const ids = data.findings.flatMap((finding) => finding.id ? [finding.id] : []);
        if (new Set(ids).size !== ids.length || ids.some((findingId) => !existing.some((finding) => finding.id === findingId))) {
          throw new BadRequestException('Each finding must belong to this inspection and appear only once.');
        }
        // Keep existing IDs, photos and audit history. Only explicitly omitted findings are removed.
        await transaction.qualityFinding.deleteMany({ where: { inspectionId: id, id: { notIn: ids } } });
        for (const finding of data.findings) {
          const previous = existing.find((item) => item.id === finding.id);
          const fields = this.findingData(finding, previous);
          if (previous) await transaction.qualityFinding.update({ where: { id: previous.id }, data: fields });
          else await transaction.qualityFinding.create({ data: { ...fields, inspectionId: id } });
        }
      }
      await transaction.qualityInspection.update({
        where: { id },
        data: { propertyId: data.propertyId, waterBodyId: data.waterBodyId || null, technicianName: data.technicianName.trim(), visitDate: new Date(data.visitDate), readings: data.readings, dosages: data.dosages, notes: data.notes?.trim() || null, ...(data.photos !== undefined ? { photos: data.photos as any } : {}) },
      });
    });
    return this.detail(id);
  }

  private findingData(finding: QualityFindingDto, previous?: { title: string; severity: string; status: string; responsibleName: string | null; requiresEstimate: boolean; resolution: string | null; resolvedAt: Date | null; estimateNumber: string | null; estimateSentAt: Date | null }) {
    return {
      title: finding.title?.trim() || previous?.title || 'Finding',
      description: finding.description.trim(),
      severity: finding.severity ?? previous?.severity ?? 'MEDIUM',
      status: finding.status ?? previous?.status ?? 'OPEN',
      responsibleName: finding.responsibleName === undefined ? previous?.responsibleName ?? null : finding.responsibleName?.trim() || null,
      requiresEstimate: finding.requiresEstimate ?? previous?.requiresEstimate ?? false,
      resolution: finding.resolution === undefined ? previous?.resolution ?? null : finding.resolution?.trim() || null,
      resolvedAt: finding.resolvedAt === undefined ? previous?.resolvedAt ?? null : finding.resolvedAt ? new Date(finding.resolvedAt) : null,
      estimateNumber: finding.estimateNumber === undefined ? previous?.estimateNumber ?? null : finding.estimateNumber?.trim() || null,
      estimateSentAt: finding.estimateSentAt === undefined ? previous?.estimateSentAt ?? null : finding.estimateSentAt ? new Date(finding.estimateSentAt) : null,
      ...(finding.photos !== undefined ? { photos: finding.photos as any } : previous ? {} : { photos: [] }),
    };
  }

  async updateFinding(id: string, data: UpdateQualityFindingDto, actorName?: string) {
    const finding = await this.prisma.qualityFinding.findUnique({ where: { id }, select: findingSummarySelect });
    if (!finding) throw new NotFoundException('Finding not found.');
    const actor = actorName?.trim() || null;
    return this.prisma.qualityFinding.update({
      where: { id }, select: findingSummarySelect,
      data: {
        status: data.status,
        ...(data.requiresEstimate !== undefined ? { requiresEstimate: data.requiresEstimate } : {}),
        ...(data.resolution !== undefined ? { resolution: data.resolution?.trim() || null, resolutionUpdatedByName: actor } : {}),
        ...(data.responsibleName !== undefined ? { responsibleName: data.responsibleName?.trim() || null } : {}),
        resolvedAt: data.resolvedAt !== undefined ? data.resolvedAt ? new Date(data.resolvedAt) : null : data.status === 'RESOLVED' ? finding.resolvedAt ?? new Date() : null,
        ...(data.status === 'RESOLVED' ? { resolvedByName: actor } : {}),
        ...(data.estimateNumber !== undefined ? { estimateNumber: data.estimateNumber?.trim() || null } : {}),
        ...(data.estimateSentAt !== undefined ? { estimateSentAt: data.estimateSentAt ? new Date(data.estimateSentAt) : null } : {}),
      },
    });
  }

  async deleteFinding(id: string) {
    const finding = await this.prisma.qualityFinding.findUnique({ where: { id }, select: { id: true } });
    if (!finding) throw new NotFoundException('Finding not found.');
    return this.prisma.qualityFinding.delete({ where: { id } });
  }

  async deleteInspection(id: string) {
    const inspection = await this.prisma.qualityInspection.findUnique({ where: { id }, select: { id: true } });
    if (!inspection) throw new NotFoundException('Quality inspection not found.');
    return this.prisma.qualityInspection.delete({ where: { id } });
  }

  private async ensureRelations(propertyId: string, waterBodyId?: string | null) {
    const property = await this.prisma.property.findFirst({ where: { id: propertyId, deletedAt: null }, select: { id: true } });
    if (!property) throw new NotFoundException('Property not found.');
    if (waterBodyId) {
      const waterBody = await this.prisma.waterBody.findFirst({ where: { id: waterBodyId, propertyId }, select: { id: true } });
      if (!waterBody) throw new NotFoundException('Water body not found for this property.');
    }
  }

  private normalizeFinding<T extends { title: string; requiresEstimate: boolean }>(finding: T) {
    return {
      ...finding,
      requiresEstimate: finding.requiresEstimate,
    };
  }
}
