import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { OpportunitiesController } from './opportunities.controller';
import { OpportunitiesService } from './opportunities.service';
import { OpportunitiesMailService } from './opportunities-mail.service';
import { OpportunitiesMailEventsService } from './opportunities-mail-events.service';

describe('Opportunities HTTP scope and intake', () => {
  let app: INestApplication, prisma: any;
  beforeAll(async () => {
    prisma = { opportunity: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue({ id: 'existing', propertyName: 'Property' }), findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'new' }), update: jest.fn().mockResolvedValue({ id: 'existing' }), upsert: jest.fn().mockResolvedValue({ id: 'intake' }) }, property: { findMany: jest.fn().mockResolvedValue([]) } };
    prisma.opportunity.updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const module = await Test.createTestingModule({ controllers: [OpportunitiesController], providers: [OpportunitiesService, { provide: OpportunitiesMailEventsService, useValue: { setEnabled: async () => ({ enabled: true }) } }, { provide: OpportunitiesMailService, useValue: { status: async () => ({ provider: 'Microsoft 365', configured: true }), sync: async () => ({ created: 0 }), reviewMessages: async () => [], resolveReview: async () => ({ id: 'reviewed' }) } }, { provide: PrismaService, useValue: prisma }, { provide: ConfigService, useValue: { get: () => 'test-intake-key' } }, { provide: AuthService, useValue: { session: async (header?: string) => { const role = header?.replace('Bearer ', ''); if (!role) throw new UnauthorizedException(); return { role }; } } }, { provide: APP_GUARD, useClass: AuthGuard }] }).compile();
    app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
  });
  afterAll(async () => app.close());
  it('lets Chemicals register an invoice and gives Reports read-only access to the queue', async () => {
    const http = request(app.getHttpServer());
    const path = '/opportunities/existing/invoice';
    const invoice = { invoiceNumber: 'INV-001', invoiceAmount: '150.25', invoiceDate: '2026-11-20' };
    const ready = { deletedAt: null, status: { equals: 'Repair Done', mode: 'insensitive' }, OR: [{ invoiceNumber: null }, { invoiceNumber: '' }] };
    await http.get('/opportunities/pending-invoices').expect(401);
    await http.get('/opportunities/pending-invoices').set('Authorization', 'Bearer REPORTS').expect(200);
    await http.get('/opportunities/pending-invoices').set('Authorization', 'Bearer CHEMICALS').expect(200);
    expect(prisma.opportunity.findMany.mock.calls.at(-1)[0].where).toEqual(ready);
    await http.patch(path).set('Authorization', 'Bearer REPORTS').send(invoice).expect(403);
    await http.patch(path).set('Authorization', 'Bearer COMMERCIAL').send({ ...invoice, invoiceDate: '2026-11-31' }).expect(400);
    await http.patch(path).set('Authorization', 'Bearer COMMERCIAL').send(invoice).expect(200, { id: 'existing' });
    await http.patch('/opportunities/existing/status').set('Authorization', 'Bearer CHEMICALS').send({ status: 'Pending' }).expect(403);
    await http.patch('/opportunities/existing').set('Authorization', 'Bearer CHEMICALS').send({ name: 'Changed' }).expect(403);
    await http.patch(path).set('Authorization', 'Bearer CHEMICALS').send({ ...invoice, name: 'Changed' }).expect(400);
    await http.patch(path).set('Authorization', 'Bearer CHEMICALS').send(invoice).expect(200, { id: 'existing' });
    expect(prisma.opportunity.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'existing', ...ready },
      data: { ...invoice, invoiceDate: new Date('2026-11-20T00:00:00Z'), status: 'Converted' },
    });
    prisma.opportunity.updateMany.mockResolvedValueOnce({ count: 0 });
    await http.patch(path).set('Authorization', 'Bearer COMMERCIAL').send(invoice).expect(409);
  });
  it('allows Commercial, Reports and administrators to read the list, while rejecting unrelated areas and anonymous requests', async () => {
    await request(app.getHttpServer()).get('/opportunities').expect(401);
    for (const role of ['COMMERCIAL', 'REPORTS', 'SUPER_ADMIN', 'OPERATIONS_DIRECTOR']) await request(app.getHttpServer()).get('/opportunities').set('Authorization', `Bearer ${role}`).expect(200);
    for (const role of ['QUALITY', 'HEALTH', 'CHEMICALS']) await request(app.getHttpServer()).get('/opportunities').set('Authorization', `Bearer ${role}`).expect(403);
  });
  it('lets Reports read details and export without granting edits, imports or mailbox administration', async () => {
    const http = request(app.getHttpServer());
    const authorization = 'Bearer REPORTS';
    await http.get('/opportunities/existing').set('Authorization', authorization).expect(200);
    await http.get('/opportunities/export').set('Authorization', authorization).expect(200);
    await http.post('/opportunities').set('Authorization', authorization).send({ propertyName: 'Property' }).expect(403);
    await http.patch('/opportunities/existing').set('Authorization', authorization).send({ status: 'Accepted' }).expect(403);
    await http.delete('/opportunities/existing').set('Authorization', authorization).expect(403);
    await http.post('/opportunities/import').set('Authorization', authorization).expect(403);
    await http.get('/opportunities/integration').set('Authorization', authorization).expect(403);
    await http.post('/opportunities/mail/sync').set('Authorization', authorization).expect(403);
  });
  it('lets Reports update the status without accepting changes to other fields', async () => {
    const http = request(app.getHttpServer());
    const path = '/opportunities/existing/status';
    const authorization = 'Bearer REPORTS';
    await http.patch(path).send({ status: 'Accepted' }).expect(401);
    await http.patch(path).set('Authorization', 'Bearer QUALITY').send({ status: 'Accepted' }).expect(403);
    await http.patch(path).set('Authorization', authorization).send({ status: 'Accepted', estimateAmount: '400' }).expect(400);
    await http.patch(path).set('Authorization', authorization).send({}).expect(400);
    await http.patch(path).set('Authorization', authorization).send({ status: 'Accepted' }).expect(200);
    expect(prisma.opportunity.update.mock.calls.at(-1)[0].data).toEqual({ status: 'Accepted' });
    await http.patch(path).set('Authorization', authorization).send({ status: null }).expect(200);
    expect(prisma.opportunity.update.mock.calls.at(-1)[0].data).toEqual({ status: null });
  });
  it('lets Reports edit work details while restricting invoice fields and other roles', async () => {
    const http = request(app.getHttpServer());
    const path = '/opportunities/existing/work';
    const work = { name: 'Updated repair', categories: ['Filter'], actualRepairDate: '2026-11-20' };
    await http.patch(path).set('Authorization', 'Bearer CHEMICALS').send(work).expect(403);
    for (const field of ['invoiceNumber', 'invoiceAmount', 'invoiceDate', 'invoiceTime']) {
      await http.patch(path).set('Authorization', 'Bearer REPORTS').send({ ...work, [field]: null }).expect(400);
    }
    await http.patch(path).set('Authorization', 'Bearer REPORTS').send(work).expect(200);
    expect(prisma.opportunity.update.mock.calls.at(-1)[0].data).toEqual({
      ...work, actualRepairDate: new Date('2026-11-20T00:00:00Z'),
    });
  });
  it('restricts deletion to administrators and does not expose source metadata or credentials in ordinary responses', async () => {
    await request(app.getHttpServer()).delete('/opportunities/existing').set('Authorization', 'Bearer COMMERCIAL').expect(403);
    await request(app.getHttpServer()).delete('/opportunities/existing').set('Authorization', 'Bearer SUPER_ADMIN').expect(200);
    expect(prisma.opportunity.update.mock.calls.at(-1)[0].data.deletedAt).toBeInstanceOf(Date);
    const result = await request(app.getHttpServer()).get('/opportunities/integration').set('Authorization', 'Bearer COMMERCIAL').expect(200);
    expect(JSON.stringify(result.body)).not.toContain('test-intake-key');
  });
  it('validates pagination, date ranges and unknown mutation fields at the API boundary', async () => {
    await request(app.getHttpServer()).get('/opportunities?page=-1').set('Authorization', 'Bearer COMMERCIAL').expect(400);
    await request(app.getHttpServer()).get('/opportunities?from=2026-12-01&to=2026-01-01').set('Authorization', 'Bearer COMMERCIAL').expect(400);
    await request(app.getHttpServer()).post('/opportunities').set('Authorization', 'Bearer COMMERCIAL').send({ propertyName: 'Property', source: 'POWER_AUTOMATE', sourceMetadata: {} }).expect(400);
    await request(app.getHttpServer()).post('/opportunities').set('Authorization', 'Bearer COMMERCIAL').send({ propertyName: 'Property', estimateAmount: '1.2345' }).expect(400);
  });
  it('accepts external automation only with the separate intake key and valid required data', async () => {
    const body = { externalId: 'message-id', mailbox: 'ximena.velosa@bluelifepools.com', receivedAt: '2026-11-13T14:25:00Z', propertyName: 'Property', estimateNumber: '7200', estimateAmount: '1250.50' };
    await request(app.getHttpServer()).post('/opportunities/automation').send(body).expect(401);
    await request(app.getHttpServer()).post('/opportunities/automation').set('x-opportunities-key', 'wrong').send(body).expect(401);
    await request(app.getHttpServer()).post('/opportunities/automation').set('x-opportunities-key', 'test-intake-key').send({ ...body, receivedAt: 'invalid' }).expect(400);
    await request(app.getHttpServer()).post('/opportunities/automation').set('x-opportunities-key', 'test-intake-key').send({ ...body, externalId: '  ' }).expect(400);
    await request(app.getHttpServer()).post('/opportunities/automation').set('x-opportunities-key', 'test-intake-key').send(body).expect(201);
    expect(prisma.opportunity.upsert).toHaveBeenCalled();
  });
  it('keeps CSV import authenticated and rejects wrong or incomplete uploads', async () => {
    await request(app.getHttpServer()).post('/opportunities/import').attach('file', Buffer.from('Title\nProperty'), 'source.csv').expect(401);
    await request(app.getHttpServer()).post('/opportunities/import').set('Authorization', 'Bearer COMMERCIAL').attach('file', Buffer.from('Title\nProperty'), 'source.csv').expect(400);
    await request(app.getHttpServer()).post('/opportunities/import').set('Authorization', 'Bearer COMMERCIAL').attach('file', Buffer.from('test'), 'source.txt').expect(400);
  });
  it('keeps direct email sync, pause and review routes behind application authentication', async () => {
    await request(app.getHttpServer()).post('/opportunities/mail/sync').expect(401);
    await request(app.getHttpServer()).patch('/opportunities/mail').send({ enabled: true }).expect(401);
    await request(app.getHttpServer()).post('/opportunities/mail/sync').set('Authorization', 'Bearer QUALITY').expect(403);
    await request(app.getHttpServer()).post('/opportunities/mail/sync').set('Authorization', 'Bearer COMMERCIAL').expect(201);
    await request(app.getHttpServer()).patch('/opportunities/mail').set('Authorization', 'Bearer COMMERCIAL').send({ enabled: 'yes' }).expect(400);
    await request(app.getHttpServer()).get('/opportunities/mail/review').set('Authorization', 'Bearer COMMERCIAL').expect(200);
  });
  it('protects the approved map with the same read access and validates its filters', async () => {
    await request(app.getHttpServer()).get('/opportunities/approved-map').expect(401);
    await request(app.getHttpServer()).get('/opportunities/approved-map').set('Authorization', 'Bearer QUALITY').expect(403);
    for (const role of ['COMMERCIAL', 'REPORTS', 'SUPER_ADMIN', 'OPERATIONS_DIRECTOR']) await request(app.getHttpServer()).get('/opportunities/approved-map').set('Authorization', `Bearer ${role}`).expect(200);
    await request(app.getHttpServer()).get('/opportunities/approved-map?from=bad').set('Authorization', 'Bearer COMMERCIAL').expect(400);
  });
});
