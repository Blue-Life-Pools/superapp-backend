import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { waitUntil } from '@vercel/functions';
import request from 'supertest';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { OpportunitiesMailEventsService } from './opportunities-mail-events.service';
import { OpportunitiesMailWebhookController } from './opportunities-mail-webhook.controller';
import { notificationFixture } from './opportunities-mail-events.fixture';

jest.mock('@vercel/functions', () => ({ waitUntil: jest.fn(), getDeadline: () => undefined }));
describe('Microsoft Graph callback HTTP contract', () => {
  let app: INestApplication, fixture: ReturnType<typeof notificationFixture>, work: Promise<unknown>[];
  beforeEach(async () => {
    fixture = notificationFixture(); work = [];
    (waitUntil as jest.Mock).mockImplementation(promise => work.push(promise));
    const module = await Test.createTestingModule({ controllers: [OpportunitiesMailWebhookController], providers: [{ provide: OpportunitiesMailEventsService, useValue: fixture.service }, { provide: AuthService, useValue: { session: () => { throw new UnauthorizedException(); } } }, { provide: APP_GUARD, useClass: AuthGuard }] }).compile();
    app = module.createNestApplication({ logger: false }); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
  });
  afterEach(async () => { await Promise.allSettled(work); await app.close(); });
  it('echoes the decoded validation token as plain text without app login or touching the mailbox', async () => {
    const token = 'opaque+token &value';
    const result = await request(app.getHttpServer()).post('/opportunities/mail/notifications').query({ validationToken: token }).set('Content-Type', 'text/plain').send('').expect(200);
    expect(result.text).toBe(token); expect(result.headers['content-type']).toMatch(/^text\/plain/); expect(result.headers['x-content-type-options']).toBe('nosniff');
    expect(fixture.graph.request).not.toHaveBeenCalled(); expect(work).toHaveLength(0);
  });
  it('confirms a persisted event quickly and schedules its specific email for server-side processing', async () => {
    await request(app.getHttpServer()).post('/opportunities/mail/notifications').send(fixture.payload()).expect(202);
    expect(fixture.queue).toHaveLength(1); expect(waitUntil).toHaveBeenCalled();
    await Promise.all(work); expect(fixture.queue[0].status).toBe('DONE'); expect(fixture.mail.receiveNotification).toHaveBeenCalledTimes(1);
  });
  it('returns the acknowledgement while slow email processing is still running', async () => {
    let complete!: () => void;
    const gate = new Promise<void>(resolve => { complete = resolve; });
    fixture.mail.receiveNotification.mockImplementationOnce(() => gate as any);
    try {
      await request(app.getHttpServer()).post('/opportunities/mail/notifications').send(fixture.payload()).timeout(2000).expect(202);
      expect(fixture.queue).toHaveLength(1);
      expect(work).toHaveLength(1);
      expect(fixture.queue[0].status).not.toBe('DONE');
    } finally { complete(); await Promise.all(work); }
    expect(fixture.queue[0].status).toBe('DONE');
  });
  it('rejects forged events and does not accept a notification that failed to persist', async () => {
    await request(app.getHttpServer()).post('/opportunities/mail/notifications').send(fixture.payload({ clientState: 'forged' })).expect(401);
    expect(work).toHaveLength(0);
    fixture.db.opportunityMailNotification.createMany.mockRejectedValueOnce(new Error('Database unavailable'));
    await request(app.getHttpServer()).post('/opportunities/mail/notifications').send(fixture.payload()).expect(500);
    expect(fixture.queue).toHaveLength(0); expect(work).toHaveLength(0);
  });
});
