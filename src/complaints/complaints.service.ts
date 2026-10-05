import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertComplaintDto } from './dto/upsert-complaint.dto';

@Injectable()
export class ComplaintsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.complaint.findMany({
      include: { property: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(data: UpsertComplaintDto) {
    await this.ensureProperty(data.propertyId);
    return this.prisma.complaint.create({
      data: { ...data, complaint: data.complaint.trim(), createdAt: data.createdAt ? new Date(data.createdAt) : undefined, reminderAt: data.reminderAt ? new Date(data.reminderAt) : null },
      include: { property: { select: { id: true, name: true } } },
    });
  }

  async update(id: string, data: UpsertComplaintDto) {
    await this.ensureProperty(data.propertyId);
    return this.prisma.complaint.update({
      where: { id },
      data: { ...data, complaint: data.complaint.trim(), createdAt: data.createdAt ? new Date(data.createdAt) : undefined, reminderAt: data.reminderAt ? new Date(data.reminderAt) : null },
      include: { property: { select: { id: true, name: true } } },
    });
  }

  private async ensureProperty(id: string) {
    const property = await this.prisma.property.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!property) throw new NotFoundException('Property not found.');
  }
}
