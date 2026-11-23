import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { GasolineController } from './gasoline.controller';
import { GasolineService } from './gasoline.service';

describe('Shared gasoline history', () => {
  let app: INestApplication;
  const purchase = { id: 'wawa-1', date: '2026-11-04', driver: 'Test Driver', city: 'Tampa', product: 'Unleaded', gallons: 12, cents: 4230, reportedMiles: null };
  const route = { first: '2026-11-04', last: '2026-11-04', driver: 'test driver', zone: 'Tampa', properties: 5, miles: 100 };
  const purchases = new Map<string, typeof purchase>();
  const routes = new Map<string, { id: string; zone: string; properties: number | null; miles: number | null }>();
  function insert<T extends { id: string }>(table: Map<string, T>, data: T[]) {
    let count = 0;
    for (const row of data) {
      if (table.has(row.id)) continue;
      table.set(row.id, row);
      count++;
    }
    return Promise.resolve({ count });
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [GasolineController],
      providers: [
        GasolineService, AuthGuard,
        { provide: AuthService, useValue: { session: (token: string) => {
          if (token === 'Bearer uploader') return { id: 'uploader', role: 'OPERATIONS_DIRECTOR' };
          if (token === 'Bearer reviewer') return { id: 'reviewer', role: 'REPORTS' };
          if (token === 'Bearer other') return { id: 'other', role: 'COMMERCIAL' };
          throw new UnauthorizedException('Login required');
        } } },
        { provide: PrismaService, useValue: {
          $transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
          gasolinePurchase: {
            findMany: () => Promise.resolve([...purchases.values()]),
            createMany: ({ data }: { data: typeof purchase[] }) => insert(purchases, data),
          },
          gasolineRoute: {
            findMany: () => Promise.resolve([...routes.values()]),
            createMany: ({ data }: { data: Array<{ id: string } & Pick<typeof route, 'zone' | 'properties' | 'miles'>> }) => insert(routes, data),
            upsert: ({ create }: { create: { id: string } & Pick<typeof route, 'zone' | 'properties' | 'miles'> }) => {
              routes.set(create.id, create);
              return Promise.resolve(create);
            },
          },
        } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalGuards(app.get(AuthGuard));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => { await app?.close(); });

  it('shares data across authorized accounts and keeps existing routes during browser imports', async () => {
    const http = request(app.getHttpServer());
    await http.get('/gasoline').expect(401);
    await http.get('/gasoline').set('Authorization', 'Bearer other').expect(403);
    await http.post('/gasoline/import').set('Authorization', 'Bearer uploader').send({ purchases: [purchase], routes: [route] })
      .expect(201, { newPurchases: 1, newRoutes: 1 });
    await http.put('/gasoline/route').set('Authorization', 'Bearer reviewer').send({ ...route, properties: 6 }).expect(200);
    await http.post('/gasoline/import').set('Authorization', 'Bearer uploader').send({ purchases: [purchase], routes: [route] })
      .expect(201, { newPurchases: 0, newRoutes: 0 });
    await http.get('/gasoline').set('Authorization', 'Bearer reviewer').expect(200, {
      purchases: [purchase],
      routes: { [JSON.stringify([route.first, route.last, route.driver])]: { zone: 'Tampa', properties: 6, miles: 100 } },
    });
  });

  it('rejects invalid route counts and reversed date ranges', async () => {
    const http = request(app.getHttpServer());
    await http.put('/gasoline/route').set('Authorization', 'Bearer reviewer').send({ ...route, properties: 0 }).expect(400);
    await http.put('/gasoline/route').set('Authorization', 'Bearer reviewer').send({ ...route, first: '2026-11-15' }).expect(400);
  });
});
