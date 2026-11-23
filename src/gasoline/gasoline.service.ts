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
    const [purchases, routes] = await this.prisma.$transaction([
      this.prisma.gasolinePurchase.findMany({ orderBy: [{ date: 'asc' }, { id: 'asc' }] }),
      this.prisma.gasolineRoute.findMany(),
    ]);
    return { purchases, routes: Object.fromEntries(routes.map(({ id, ...route }) => [id, route])) };
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
