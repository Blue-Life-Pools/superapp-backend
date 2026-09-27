import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.property.findMany({
      orderBy: {
        name: 'asc',
      },
      include: {
        managementCompany: true,

        contacts: {
          include: {
            contact: true,
          },
        },

        waterBodies: true,

        salesActivities: {
          orderBy: {
            occurredAt: 'desc',
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const property = await this.prisma.property.findUnique({
      where: {
        id,
      },

      include: {
        managementCompany: true,

        contacts: {
          include: {
            contact: true,
          },
        },

        waterBodies: true,

        salesActivities: {
          orderBy: {
            occurredAt: 'desc',
          },
        },
      },
    });

    if (!property) {
      throw new NotFoundException(
        `No se encontró la propiedad con id ${id}`,
      );
    }

    return property;
  }

  create(data: any) {
    return this.prisma.property.create({
      data,
    });
  }
}