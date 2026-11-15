import { emailIdentity, emailText, parseEstimateEmail, receivedDay } from './opportunity-email';
import { estimateMessage } from './opportunity-email.fixture';
describe('Direct estimate email extraction', () => {
  it('uses the actual total, property, description and Bogota receipt date', () => {
    expect(parseEstimateEmail(estimateMessage())?.fields).toEqual({ estimateNumber: '7400', propertyName: 'Example Apartments', estimateAmount: '1250.00', creationDate: '2026-11-13', status: 'Pending', name: 'POOL: REPLACE MOTOR · INSTALL MOTOR' });
    expect(receivedDay('2026-11-14T06:00:00Z')).toBe('2026-11-14');
  });
  it('supports HTML and zero amounts without executing content or retaining tracking links', () => {
    const body = { contentType: 'HTML', content: '<style>secret</style><script>run()</script><p>ESTIMATE 7400 DETAILS</p><p>Example &amp; Partners,</p><p>Please review the estimate below.</p><p>Total&nbsp;$0.00</p>' };
    expect(parseEstimateEmail(estimateMessage({ body }))?.fields).toMatchObject({ propertyName: 'Example & Partners', estimateAmount: '0.00' });
    expect(emailText(body)).not.toMatch(/run|secret/);
  });
  it('reads summary-only QuickBooks totals when financing text separates the amount and review button', () => {
    const body = { contentType: 'text', content: 'Your estimate is ready!\n$2,842.00\nPay over time on your future invoice with [Affirm]. See if you qualify\nExample Apartments,\nPlease review the estimate below.\nWe look forward to working with you.\nReview and approve' };
    expect(parseEstimateEmail(estimateMessage({ body }))).toMatchObject({ fields: { estimateNumber: '7400', propertyName: 'Example Apartments', estimateAmount: '2842.00', status: 'Pending', creationDate: '2026-11-13' }, reason: null });
    const zero = { contentType: 'html', content: '<h1>Your estimate is ready!</h1><p>$0.00</p><p>Pay over time from $20.00 a month.</p><p>Example Apartments,</p><p>Please review the estimate below.</p><p>Review and approve</p>' };
    expect(parseEstimateEmail(estimateMessage({ body: zero }))?.fields.estimateAmount).toBe('0.00');
  });
  it('does not mistake an isolated line-item or financing amount for a missing estimate total', () => {
    const content = 'Example Apartments,\nPlease review the estimate below.\nPay over time from $20.00 a month.\n$25.00\nReplacement part\n1 x $25.00\nReview and approve';
    expect(parseEstimateEmail(estimateMessage({ body: { content } }))).toMatchObject({ reason: 'The estimate total could not be identified in this email.' });
  });
  it('excludes replies, approvals, invoices and unrelated senders', () => {
    for (const subject of ['Re: Estimate 7400 from BLUE LIFE POOL SERVICE', 'FW: Estimate #7400 approved', 'Invoice 7400 from BLUE LIFE POOL SERVICE', 'Estimate 7400 from Another Company']) expect(parseEstimateEmail(estimateMessage({ subject }))).toBeNull();
    expect(parseEstimateEmail(estimateMessage({ from: { emailAddress: { address: 'unrelated@example.test' } } }))).toBeNull();
  });
  it('leaves incomplete or conflicting messages for review instead of inventing fields', () => {
    expect(parseEstimateEmail(estimateMessage({ body: { content: 'ESTIMATE 7401 DETAILS\nTotal $30.00' } }))?.reason).toContain('numbers');
    const missing = parseEstimateEmail(estimateMessage({ body: { content: 'ESTIMATE 7400 DETAILS\nAddress\n123 Street\nTotal $30.00' } }));
    expect(missing?.reason).toContain('property'); expect(missing?.fields.propertyName).toBeUndefined();
    expect(parseEstimateEmail(estimateMessage({ body: { content: 'Example Apartments,\nPlease review the estimate below.\nSubtotal $50.00' } }))?.reason).toContain('total');
  });
  it('keeps message identity independent of subject and mailbox folder changes', () => {
    expect(emailIdentity(estimateMessage())).toBe(emailIdentity(estimateMessage({ subject: 'Different title' })));
    expect(emailIdentity(estimateMessage())).not.toBe(emailIdentity(estimateMessage({ id: 'another-immutable-id' })));
  });
});
