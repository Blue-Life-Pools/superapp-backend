import { OpportunitiesMailService } from './opportunities-mail.service';
import { notificationFixture } from './opportunities-mail-events.fixture';

describe('Email arrival notifications', () => {
  let fixture: ReturnType<typeof notificationFixture>, probe: jest.SpiedFunction<typeof fetch>;
  beforeEach(() => {
    fixture = notificationFixture();
    probe = jest.spyOn(globalThis, 'fetch').mockImplementation(async (url) => new Response(new URL(String(url)).searchParams.get('validationToken'), { status: 200, headers: { 'Content-Type': 'text/plain' } }));
  });
  afterEach(() => probe.mockRestore());
  it('durably accepts an authenticated event, processes only that email, and deduplicates redelivery', async () => {
    const { service, payload, queue, graph, mail } = fixture;
    expect(await service.accept(payload())).toEqual({ accepted: 1, wake: true });
    expect(queue[0].status).toBe('PENDING'); expect(graph.request).not.toHaveBeenCalled();
    expect(await service.processPending()).toEqual({ processed: 1, failed: 0 });
    expect(mail.receiveNotification).toHaveBeenCalledTimes(1); expect(mail.sync).not.toHaveBeenCalled();
    expect(graph.request.mock.calls.every(([url]) => url.startsWith('/users/ximena.velosa%40bluelifepools.com/messages/immutable-message-1?'))).toBe(true);
    expect(queue[0].status).toBe('DONE');
    expect(await service.accept(payload())).toEqual({ accepted: 0, wake: true });
    await service.processPending(); expect(mail.receiveNotification).toHaveBeenCalledTimes(1);
  });
  it('rejects incorrect state, subscription and tenant without creating work or fetching email', async () => {
    for (const changed of [{ clientState: 'wrong' }, { subscriptionId: 'other' }, { tenantId: 'other' }, { resourceData: { id: '' } }]) await expect(fixture.service.accept(fixture.payload(changed))).rejects.toThrow('verified');
    for (const body of [null, { value: [] }, { value: Array.from({ length: 1001 }, () => ({})) }]) await expect(fixture.service.accept(body)).rejects.toThrow('Invalid');
    expect(fixture.queue).toHaveLength(0); expect(fixture.graph.request).not.toHaveBeenCalled();
  });
  it('does not acknowledge work when durable persistence fails', async () => {
    fixture.db.opportunityMailNotification.createMany.mockRejectedValueOnce(new Error('Database unavailable'));
    await expect(fixture.service.accept(fixture.payload())).rejects.toThrow('Database unavailable');
    expect(fixture.queue).toHaveLength(0);
  });
  it('does not download unrelated email bodies and treats removed messages as completed', async () => {
    fixture.graph.request.mockResolvedValueOnce({ id: 'other', subject: 'Newsletter', from: { emailAddress: { address: 'other@example.test' } } } as any);
    await fixture.service.accept(fixture.payload()); await fixture.service.processPending();
    expect(fixture.graph.request).toHaveBeenCalledTimes(1); expect(fixture.mail.receiveNotification).not.toHaveBeenCalled(); expect(fixture.queue[0].status).toBe('DONE');
    await fixture.service.accept(fixture.payload({ resourceData: { id: 'gone' } }));
    fixture.graph.request.mockRejectedValueOnce(new Error('Microsoft Graph request failed (404)'));
    await fixture.service.processPending(); expect(fixture.queue[1].status).toBe('DONE');
  });
  it('retains failed work, retries without duplicate processing and reclaims expired leases', async () => {
    await fixture.service.accept(fixture.payload());
    fixture.graph.request.mockRejectedValueOnce(new Error('Microsoft Graph request failed (429)'));
    expect(await fixture.service.processPending()).toMatchObject({ failed: 1 }); expect(fixture.queue[0].status).toBe('FAILED');
    fixture.queue[0].availableAt = new Date(0);
    expect(await fixture.service.processPending()).toMatchObject({ processed: 1 }); expect(fixture.mail.receiveNotification).toHaveBeenCalledTimes(1);
    await fixture.service.accept(fixture.payload({ resourceData: { id: 'worker-interrupted' } }));
    Object.assign(fixture.queue[1], { status: 'PROCESSING', lockOwner: 'expired-worker', lockUntil: new Date(0) });
    await fixture.service.processPending(); expect(fixture.queue[1].status).toBe('DONE');
  });
  it('pauses both acceptance and processing without removing existing queued records', async () => {
    await fixture.service.accept(fixture.payload()); fixture.state.enabled = false;
    expect(await fixture.service.accept(fixture.payload())).toMatchObject({ wake: false });
    expect(await fixture.service.processPending()).toEqual({ processed: 0, failed: 0 });
    expect(fixture.queue[0].status).toBe('PENDING'); expect(fixture.graph.request).not.toHaveBeenCalled();
  });
  it('does not renew or register against an unpublished endpoint and never claims old polling is live', async () => {
    probe.mockResolvedValueOnce(new Response('Cannot POST', { status: 404 }));
    expect(await fixture.service.ensureSubscription()).toMatchObject({ active: false }); expect(fixture.graph.request).not.toHaveBeenCalled();
    expect(fixture.state.subscriptionError).toContain('published');
    const db = { ...fixture.db, opportunityEmailReceipt: { groupBy: async () => [], findFirst: async () => null } };
    fixture.state.subscriptionId = null; fixture.state.lastScheduledSyncAt = new Date();
    const status = await new OpportunitiesMailService(db as any, fixture.graph as any, fixture.config as any).status();
    expect(status).toMatchObject({ automatic: false, trigger: 'EMAIL_RECEIVED', schedule: 'When an email arrives' }); expect(JSON.stringify(status)).not.toContain('test-client-state');
  });
  it('subscribes with immutable IDs, validates the callback, and sets recovery only on initial activation', async () => {
    fixture.state.subscriptionId = null; fixture.state.subscriptionClientState = null;
    expect(await fixture.service.ensureSubscription()).toMatchObject({ active: true, created: true });
    const post = fixture.graph.request.mock.calls.find(([url, init]) => url === '/subscriptions' && init?.method === 'POST')!;
    const input = JSON.parse(post[1].body);
    expect(input).toMatchObject({ changeType: 'created', resource: 'users/ximena.velosa@bluelifepools.com/messages', includeResourceData: false, notificationUrl: 'https://example.test/opportunities/mail/notifications', lifecycleNotificationUrl: 'https://example.test/opportunities/mail/notifications' });
    expect(post[1].headers.Prefer).toBe('IdType="ImmutableId"'); expect(input.clientState.length).toBeGreaterThan(30); expect(fixture.state.recoveryRequestedAt).toBeInstanceOf(Date);
    expect(new Date(input.expirationDateTime).getTime() - Date.now()).toBeLessThanOrEqual(6 * 86400000);
  });
  it('maintenance renews the subscription without periodically reading mailbox contents', async () => {
    expect(await fixture.service.maintain()).toMatchObject({ active: true, recovery: false });
    expect(fixture.mail.sync).not.toHaveBeenCalled();
    expect(fixture.graph.request.mock.calls.every(([url]) => url.startsWith('/subscriptions/'))).toBe(true);
  });
  it('recovers a missed-notifications event and reauthorizes without a periodic mailbox scan', async () => {
    await fixture.service.accept(fixture.payload({ lifecycleEvent: 'missed' }));
    await fixture.service.processPending(); expect(fixture.mail.sync).toHaveBeenCalledTimes(1); expect(fixture.state.recoveryRequestedAt).toBeNull();
    await fixture.service.accept(fixture.payload({ lifecycleEvent: 'reauthorizationRequired' }));
    await fixture.service.processPending(); expect(fixture.mail.sync).toHaveBeenCalledTimes(1);
    expect(fixture.graph.request.mock.calls.some(([url, init]) => url.startsWith('/subscriptions/') && init?.method === 'PATCH')).toBe(true);
  });
  it('adopts only its own subscription after a timed-out registration without creating another', async () => {
    fixture.state.subscriptionId = null;
    fixture.graph.request.mockResolvedValueOnce({ value: [{ id: 'previously-created', clientState: fixture.state.subscriptionClientState, notificationUrl: 'https://example.test/opportunities/mail/notifications', resource: 'users/11111111-1111-1111-1111-111111111111/messages' }] } as any).mockResolvedValueOnce({ id: 'previously-created', expirationDateTime: new Date(Date.now() + 6 * 86400000).toISOString() } as any);
    expect(await fixture.service.ensureSubscription()).toMatchObject({ active: true });
    expect(fixture.state.subscriptionId).toBe('previously-created');
    expect(fixture.graph.request.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });
  it('recreates a removed subscription and recovers the delivery gap', async () => {
    await fixture.service.accept(fixture.payload({ lifecycleEvent: 'subscriptionRemoved' }));
    expect(await fixture.service.processPending()).toMatchObject({ processed: 1, failed: 0 });
    expect(fixture.state.subscriptionId).toBe('new-sub'); expect(fixture.mail.sync).toHaveBeenCalledTimes(1);
    expect(fixture.queue[0].status).toBe('DONE');
  });
  it('retries removal of a paused subscription without processing any mail', async () => {
    fixture.graph.request.mockRejectedValueOnce(new Error('Microsoft Graph request failed (503)'));
    await fixture.service.setEnabled(false); expect(fixture.state.enabled).toBe(false); expect(fixture.state.subscriptionId).toBe('sub-1');
    expect(await fixture.service.maintain()).toMatchObject({ paused: true, active: false });
    expect(fixture.state.subscriptionId).toBeNull(); expect(fixture.mail.sync).not.toHaveBeenCalled(); expect(fixture.mail.receiveNotification).not.toHaveBeenCalled();
  });
});
