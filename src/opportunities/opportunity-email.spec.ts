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
