import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GasolineRouteDto, ImportGasolineDto } from './gasoline.dto';

function routeRecord({ first, last, driver, zone, properties, miles }: GasolineRouteDto) {
  if (first > last || first.slice(0, 7) !== last.slice(0, 7)) {
    throw new BadRequestException('Enter a route date range within one month.');
  }
  return {
    id: JSON.stringify([first, last, driver.normalize('NFKC').toLowerCase()]),
    zone: zone.trim(),
    properties: properties ?? null,
    miles: miles ?? null,
  };
}

@Injectable()
export class GasolineService {
  constructor(private readonly prisma: PrismaService) {}

  async history() {
    const [purchases, routes, propertyArchive] = await this.prisma.$transaction([
      this.prisma.gasolinePurchase.findMany({ orderBy: [{ date: 'asc' }, { id: 'asc' }] }),
      this.prisma.gasolineRoute.findMany(),
      this.prisma.gasolinePropertyArchive.findMany({ select: { month: true, propertyCount: true } }),
    ]);
    return {
      purchases,
      routes: Object.fromEntries(routes.map(({ id, ...route }) => [id, route])),
      archivedPropertyCounts: Object.fromEntries(propertyArchive.map(({ month, propertyCount }) => [month, propertyCount])),
    };
  }

  async archivedProperties(month: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BadRequestException('Select a valid report month.');
    const archive = await this.prisma.gasolinePropertyArchive.findUnique({ where: { month }, select: { properties: true } });
    return archive?.properties ?? [];
  }

  async chemicalProperties(month: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BadRequestException('Select a valid report month.');
    const periods = await this.prisma.chemicalConsumptionPeriod.findMany({
      where: { month, property: { deletedAt: null }, OR: [{ sourceName: { not: null } }, { technicianOverride: { not: null } }] },
      select: {
        propertyId: true, technicianOverride: true, sourceName: true, chemicals: true,
        property: { select: { name: true, city: true, waterBodies: { where: { active: true, technicianName: { not: null } }, select: { technicianName: true } } } },
      },
      orderBy: { property: { name: 'asc' } },
    });
    return periods.map(period => {
      const manual = period.technicianOverride?.trim();
      const assigned = manual ? [manual]
        : [...new Set(period.property.waterBodies.flatMap(body => body.technicianName?.trim() || []))];
      const participants = new Map<string, Set<string>>();
      if (period.sourceName && Array.isArray(period.chemicals)) {
        for (const chemical of period.chemicals) {
          const usages = (chemical as { technicians?: unknown } | null)?.technicians;
          if (!Array.isArray(usages)) continue;
          for (const usage of usages) {
            const name = typeof usage?.name === 'string' ? usage.name.trim() : '';
            if (!name) continue;
            const recorded: string[] = Array.isArray(usage.serviceDates)
              ? usage.serviceDates.filter((date: unknown) => typeof date === 'string' && date.startsWith(month + '-') && /^\d{4}-\d{2}-\d{2}$/.test(date)) : [];
            if (!recorded.length && !(usage.quantity > 0 || usage.cost > 0)) continue;
            const dates = participants.get(name) ?? new Set<string>();
            recorded.forEach(date => dates.add(date));
            participants.set(name, dates);
          }
        }
      }
      return {
        id: period.propertyId, name: period.property.name, city: period.property.city, assigned,
        participants: [...participants].map(([name, dates]) => ({ name, dates: [...dates].sort() })),
      };
    });
  }

  async importReport({ purchases, routes }: ImportGasolineDto) {
    const routeRecords = routes?.map(routeRecord) ?? [];
    const [imported, importedRoutes] = await this.prisma.$transaction([
      this.prisma.gasolinePurchase.createMany({ data: purchases, skipDuplicates: true }),
      this.prisma.gasolineRoute.createMany({ data: routeRecords, skipDuplicates: true }),
    ]);
    return { newPurchases: imported.count, newRoutes: importedRoutes.count };
  }

  async saveRoute(data: GasolineRouteDto) {
    const { id, ...route } = routeRecord(data);
    return this.prisma.gasolineRoute.upsert({ where: { id }, create: { id, ...route }, update: route });
  }
}
