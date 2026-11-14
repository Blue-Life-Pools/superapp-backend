import type { EstimateMessage } from './opportunity-email';
export const estimateMessage = (overrides: Partial<EstimateMessage> = {}): EstimateMessage => ({
  id: 'immutable-message-1', subject: 'Estimate 7400 from BLUE LIFE POOL SERVICE | CPC 1461225',
  receivedDateTime: '2026-11-14T02:00:00Z', from: { emailAddress: { address: 'quickbooks@notification.intuit.com' } },
  body: { contentType: 'text', content: 'ESTIMATE 7400 DETAILS\nBLUE LIFE POOL SERVICE\n$1,250.00\nReview and approve\nPowered by QuickBooks\nExample Apartments,\nPlease review the estimate below.\nAddress\n123 Example Road\nShip to\nExample Apartments\nMOTOR.\n$1,000.00\nPOOL: REPLACE MOTOR\n1 X $1,000.00\nINSTALLATION\n$250.00\nINSTALL MOTOR\n1 X $250.00\nSubtotal $1,250.00\nTax $0.00\nTotal $1,250.00\nReview and approve' }, ...overrides,
});
