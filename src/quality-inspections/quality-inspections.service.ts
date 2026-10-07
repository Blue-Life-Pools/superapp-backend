import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertQualityInspectionDto } from './dto/upsert-quality-inspection.dto';

@Injectable()
export class QualityInspectionsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.qualityInspection.findMany({
      include: { property: { select: { id: true, name: true } }, waterBody: { select: { id: true, name: true } }, findings: { select: { id: true, title: true, description: true, severity: true, status: true, requiresEstimate: true, resolution: true, createdAt: true, updatedAt: true }, orderBy: { createdAt: 'desc' } } },
      orderBy: { visitDate: 'desc' },
    });
  }

  async detail(id: string) {
    const inspection = await this.prisma.qualityInspection.findUnique({
      where: { id },
      include: { property: { select: { id: true, name: true } }, waterBody: { select: { id: true, name: true } }, findings: { orderBy: { createdAt: 'desc' } } },
    });
    if (!inspection) throw new NotFoundException('Quality inspection not found.');
    return inspection;
  }

  async create(data: UpsertQualityInspectionDto) {
    await this.ensureRelations(data.propertyId, data.waterBodyId);
    return this.prisma.qualityInspection.create({
      data: { propertyId: data.propertyId, waterBodyId: data.waterBodyId || null, technicianName: data.technicianName.trim(), visitDate: new Date(data.visitDate), readings: data.readings, dosages: data.dosages, notes: data.notes?.trim() || null, photos: data.photos || [], findings: { create: (data.findings || []).map((finding) => ({ title: finding.title?.trim() || 'Finding', description: finding.description.trim(), severity: finding.severity || 'MEDIUM', status: finding.status || 'OPEN', requiresEstimate: finding.requiresEstimate || false, resolution: finding.resolution?.trim() || null, photos: finding.photos || [] })) } },
      include: { property: { select: { id: true, name: true } }, waterBody: { select: { id: true, name: true } }, findings: true },
    });
  }

  async updateFinding(id: string, status: string, resolution?: string) {
    const finding = await this.prisma.qualityFinding.findUnique({ where: { id } });
    if (!finding) throw new NotFoundException('Finding not found.');
    return this.prisma.qualityFinding.update({ where: { id }, data: { status, resolution: resolution?.trim() || null } });
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
}
