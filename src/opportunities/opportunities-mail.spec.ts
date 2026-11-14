import { OpportunitiesMailService } from './opportunities-mail.service';
import { estimateMessage } from './opportunity-email.fixture';

describe('Mailbox sync persistence and recovery', () => {
  let db: any, graph: any, state: any, mail: OpportunitiesMailService, receipts: any[], rows: any[];
  const now = new Date('2026-11-14T06:00:00Z');
  beforeEach(() => {
    receipts = []; rows = []; state = { id: 'estimates', enabled: true, lastScannedAt: null, nextLink: null, scanThrough: null, lockOwner: null, lockUntil: null };
    db = {
      opportunityMailConnection: {
        findUnique: jest.fn(async () => ({ ...state })),
        updateMany: jest.fn(async ({ where, data }) => {
          if (where.lockOwner && where.lockOwner !== state.lockOwner) return { count: 0 };
          if (where.OR && state.lockUntil && state.lockUntil > now) return { count: 0 };
          Object.assign(state, data); return { count: 1 };
        }),
      },
      property: { findMany: jest.fn().mockResolvedValue([{ id: 'property', name: 'Example Apartments' }]) },
      opportunity: {
        findFirst: jest.fn().mockResolvedValue({ creationDate: new Date('2026-11-13T00:00:00Z') }),
        findMany: jest.fn(async ({ where }) => rows.filter(row => typeof where.estimateNumber === 'string' ? row.estimateNumber === where.estimateNumber : where.estimateNumber.in.includes(row.estimateNumber))),
        create: jest.fn(async ({ data }) => { const row = { id: `new-${rows.length}`, ...data }; rows.push(row); return row; }),
      },
      opportunityEmailReceipt: {
        findUnique: jest.fn(async ({ where }) => receipts.find(row => where.id ? row.id === where.id : row.mailbox === where.mailbox_messageId?.mailbox && row.messageId === where.mailbox_messageId?.messageId) || null),
        findMany: jest.fn(async () => receipts.filter(row => row.status === 'NEEDS_REVIEW')),
        create: jest.fn(async ({ data }) => { const row = { id: `receipt-${receipts.length}`, ...data }; receipts.push(row); return row; }),
        update: jest.fn(async ({ where, data }) => { const row = receipts.find(row => row.id === where.id); Object.assign(row, data); return row; }),
        updateMany: jest.fn(async ({ where, data }) => { const row = receipts.find(row => row.id === where.id && row.status === where.status); if (!row) return { count: 0 }; Object.assign(row, data); return { count: 1 }; }),
      },
      $transaction: jest.fn(async fn => fn(db)),
    };
    graph = { request: jest.fn().mockResolvedValue({ value: [estimateMessage()] }) };
    mail = new OpportunitiesMailService(db, graph, { get: (key: string) => key.startsWith('MICROSOFT_') ? 'configured-test-value' : undefined } as any);
  });
  it('creates an opportunity and receipt atomically, and repeat sync does not overwrite edits', async () => {
    expect(await mail.sync('scheduled', 2, now)).toMatchObject({ created: 1, hasMore: false });
    expect(rows[0]).toMatchObject({ source: 'MICROSOFT_365', propertyId: 'property', estimateAmount: '1250.00', creationDate: new Date('2026-11-13'), receivedAt: new Date('2026-11-14T02:00:00Z') });
    rows[0].name = 'Edited by user'; rows[0].status = 'Accepted';
    expect(await mail.sync('scheduled', 2, now)).toMatchObject({ created: 0 });
    expect(rows).toHaveLength(1); expect(rows[0].name).toBe('Edited by user'); expect(rows[0].status).toBe('Accepted'); expect(receipts).toHaveLength(1);
    expect(state.lastScheduledSyncAt).toEqual(now); expect(state.lockOwner).toBeNull();
  });
  it('links unique CSV matches without duplicating or changing the imported data', async () => {
    rows.push({ id: 'csv', estimateNumber: '7400', propertyName: 'EXAMPLE APARTMENTS', propertyId: 'property', status: 'Converted', estimateAmount: '950.00', creationDate: '2026-11-01' });
    expect(await mail.sync('manual', 2, now)).toMatchObject({ created: 0, linked: 1 });
    expect(receipts[0]).toMatchObject({ status: 'LINKED', opportunityId: 'csv' }); expect(rows).toHaveLength(1); expect(rows[0].status).toBe('Converted'); expect(rows[0].estimateAmount).toBe('950.00');
  });
  it('does not guess among duplicate CSV records or resurrect a deleted row', async () => {
    rows.push({ id: 'first', estimateNumber: '7400', propertyName: 'Example Apartments' }, { id: 'second', estimateNumber: '7400', propertyName: 'Example Apartments' });
    expect(await mail.sync('manual', 2, now)).toMatchObject({ review: 1, created: 0 }); expect(receipts[0].reason).toContain('Several');
    receipts.length = 0; rows.pop(); rows[0].deletedAt = now;
    await mail.sync('manual', 2, now); expect(receipts[0].status).toBe('IGNORED_DELETED'); expect(rows).toHaveLength(1);
  });
  it('queues incomplete original estimates for review and excludes unrelated messages', async () => {
    graph.request.mockResolvedValue({ value: [estimateMessage({ body: { content: 'Total $50.00' } }), estimateMessage({ id: 'reply', subject: 'Re: Estimate 7400 from BLUE LIFE POOL SERVICE' })] });
    expect(await mail.sync('manual', 2, now)).toMatchObject({ review: 1, created: 0, scanned: 2 }); expect(receipts).toHaveLength(1); expect(receipts[0].status).toBe('NEEDS_REVIEW');
  });
  it('persists each page cursor and resumes all remaining pages independently of UI pagination', async () => {
    const next = 'https://graph.microsoft.com/v1.0/users/ximena.velosa%40bluelifepools.com/messages?$skiptoken=test';
    graph.request.mockResolvedValueOnce({ value: [estimateMessage()], '@odata.nextLink': next }).mockRejectedValueOnce(new Error('Microsoft Graph request failed (429)'));
    await expect(mail.sync('scheduled', 2, now)).rejects.toThrow('limiting'); expect(state.nextLink).toBe(next); expect(state.lastScannedAt).toBeNull(); expect(state.lockOwner).toBeNull();
    graph.request.mockResolvedValueOnce({ value: [estimateMessage({ id: 'next', subject: 'Estimate 7401 from BLUE LIFE POOL SERVICE', body: { content: 'ESTIMATE 7401 DETAILS\nExample Apartments,\nPlease review the estimate below.\nTotal $25.00' } })] });
    expect(await mail.sync('scheduled', 2, now)).toMatchObject({ created: 1, hasMore: false }); expect(graph.request.mock.calls[2][0]).toContain('$skiptoken=test'); expect(rows).toHaveLength(2); expect(state.lastScannedAt).toEqual(now);
  });
  it('respects pause and an existing lease, and rejects pagination outside Microsoft Graph', async () => {
    state.enabled = false; expect(await mail.sync('scheduled', 2, now)).toMatchObject({ paused: true }); expect(graph.request).not.toHaveBeenCalled();
    state.enabled = true; state.lockUntil = new Date(now.getTime() + 60000); expect(await mail.sync('manual', 2, now)).toMatchObject({ busy: true });
    state.lockUntil = null; state.nextLink = 'https://unrelated.example.test/collect';
    await expect(mail.sync('manual', 2, now)).rejects.toThrow('could not finish'); expect(graph.request).not.toHaveBeenCalled(); expect(state.lockOwner).toBeNull();
  });
  it('allows explicitly choosing an existing match without changing its status, amount or description', async () => {
    rows.push({ id: 'first', propertyId: 'property', estimateNumber: '7400', propertyName: 'Example Apartments', status: 'Converted', name: 'User edit', estimateAmount: '900.00' }, { id: 'second', propertyId: 'property', estimateNumber: '7400', propertyName: 'Example Apartments', status: 'Accepted', name: 'Other user edit', estimateAmount: '800.00' });
    await mail.sync('manual', 2, now);
    const before = JSON.stringify(rows), id = receipts[0].id;
    await expect(mail.linkReview(id, 'unrelated')).rejects.toThrow('Choose');
    expect(await mail.linkReview(id, 'second')).toEqual({ id: 'second' });
    expect(receipts[0]).toMatchObject({ status: 'LINKED', opportunityId: 'second', reason: null }); expect(JSON.stringify(rows)).toBe(before);
    await expect(mail.linkReview(id, 'second')).rejects.toThrow();
  });
  it('completes a missing property through review and rejects a second submission', async () => {
    graph.request.mockResolvedValue({ value: [estimateMessage({ body: { content: 'Total $50.00' } })] });
    await mail.sync('manual', 2, now);
    const id = receipts[0].id, input = { propertyName: 'Example Apartments', estimateNumber: '7400', estimateAmount: '50.00', creationDate: '2026-11-13' };
    const result = await mail.resolveReview(id, input);
    expect(rows).toHaveLength(1); expect(receipts[0]).toMatchObject({ status: 'IMPORTED', opportunityId: result.id });
    await expect(mail.resolveReview(id, input)).rejects.toThrow('no longer');
  });
});
