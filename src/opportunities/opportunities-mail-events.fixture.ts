import { OpportunitiesMailEventsService } from './opportunities-mail-events.service';
import { estimateMessage } from './opportunity-email.fixture';

export function notificationFixture() {
  const state: any = { id: 'estimates', enabled: true, subscriptionId: 'sub-1', subscriptionClientState: 'test-client-state-value', subscriptionExpiresAt: new Date(Date.now() + 86400000), subscriptionLockUntil: null, subscriptionLockOwner: null, recoveryRequestedAt: null };
  const queue: any[] = [];
  const matches = (row: any, where: any) => Object.entries(where).every(([key, value]) => key === 'OR' || key === 'id' && row.id === value || key !== 'id' && (value instanceof Date ? row[key]?.getTime() === value.getTime() : row[key] === value));
  const db: any = {
    opportunityMailConnection: {
      findUnique: jest.fn(async () => ({ ...state })),
      update: jest.fn(async ({ data }) => Object.assign(state, data)),
      updateMany: jest.fn(async ({ where, data }) => {
        if (!matches(state, where)) return { count: 0 };
        if (where.OR && state.subscriptionLockUntil && state.subscriptionLockUntil > new Date()) return { count: 0 };
        Object.assign(state, data); return { count: 1 };
      }),
    },
    opportunityMailNotification: {
      createMany: jest.fn(async ({ data }) => { let count = 0; for (const row of data) if (!queue.some(other => other.eventKey === row.eventKey)) { queue.push({ id: `event-${queue.length}`, ...row, status: 'PENDING', attempts: 0, lockUntil: null, lockOwner: null, createdAt: new Date(), availableAt: new Date() }); count++; } return { count }; }),
      findFirst: jest.fn(async () => queue.find(row => (['PENDING', 'FAILED'].includes(row.status) && row.availableAt <= new Date()) || row.status === 'PROCESSING' && row.lockUntil < new Date()) || null),
      updateMany: jest.fn(async ({ where, data }) => { const row = queue.find(row => matches(row, where)); if (!row) return { count: 0 }; const { attempts, ...rest } = data; if (attempts) row.attempts += attempts.increment; Object.assign(row, rest); return { count: 1 }; }),
      count: jest.fn(async () => queue.filter(row => row.status !== 'DONE').length),
    },
    $transaction: jest.fn(async (fn: any) => fn(db)),
  };
  const mail = { receiveNotification: jest.fn().mockResolvedValue('IMPORTED'), sync: jest.fn().mockResolvedValue({ created: 0, linked: 0, review: 0, scanned: 0, hasMore: false }), setEnabled: jest.fn(async (enabled: boolean) => { state.enabled = enabled; }), status: jest.fn(async () => ({ enabled: state.enabled })) };
  const graph = { request: jest.fn(async (url: string, init: any = {}) => {
    if (url === '/subscriptions' && init.method === 'POST') return { id: 'new-sub', expirationDateTime: JSON.parse(init.body).expirationDateTime };
    if (url === '/subscriptions') return { value: [] };
    if (url.startsWith('/subscriptions/') && init.method === 'PATCH') return { id: url.split('/').at(-1), expirationDateTime: JSON.parse(init.body).expirationDateTime };
    if (init.method === 'DELETE') return undefined;
    const message = estimateMessage();
    if (!url.includes(',body')) { const { body, ...meta } = message; return meta; }
    return message;
  }) };
  const config = { get: (key: string) => key === 'MICROSOFT_TENANT_ID' ? 'tenant-test' : key === 'OPPORTUNITIES_MAIL_WEBHOOK_URL' ? 'https://example.test/opportunities/mail/notifications' : 'configured' };
  const service = new OpportunitiesMailEventsService(db, graph as any, mail as any, config as any);
  const payload = (overrides: Record<string, unknown> = {}) => ({ value: [{ subscriptionId: state.subscriptionId, clientState: state.subscriptionClientState, tenantId: 'tenant-test', changeType: 'created', resourceData: { id: 'immutable-message-1', '@odata.type': '#Microsoft.Graph.Message' }, ...overrides }] });
  return { db, graph, mail, state, queue, service, config, payload };
}
