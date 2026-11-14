import { createHash } from 'node:crypto';
import { moneyValue } from './opportunity-data';

export const opportunityMailbox = 'ximena.velosa@bluelifepools.com';
export const estimateSender = 'quickbooks@notification.intuit.com';
export type EstimateMessage = {
  id: string;
  internetMessageId?: string;
  subject?: string;
  receivedDateTime: string;
  from?: { emailAddress?: { address?: string } };
  body?: { contentType?: string; content?: string };
};
export type EmailOpportunityFields = { propertyName?: string; estimateNumber: string; estimateAmount?: string; name?: string; creationDate: string; status: string };
export function estimateNumberFromMessage(message: Pick<EstimateMessage, 'subject' | 'from'>) {
  if (message.from?.emailAddress?.address?.toLowerCase() !== estimateSender) return null;
  return message.subject?.trim().match(/^Estimate\s+#?\s*(\d+)\s+from\s+BLUE LIFE POOL SERVICE(?:\s*\||\s*$)/i)?.[1] || null;
}
const entities: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };
export function emailText(body: EstimateMessage['body']) {
  let text = (body?.content || '').slice(0, 250000);
  if (body?.contentType?.toLowerCase() === 'html') text = text.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<(?:br\s*\/?|\/(?:p|div|tr|h\d|li|table))\s*>/gi, '\n').replace(/<\/?(?:td|th)\b[^>]*>/gi, '\t').replace(/<[^>]*>/g, '');
  return text.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (match, entity: string) => {
    if (entities[entity.toLowerCase()]) return entities[entity.toLowerCase()];
    if (entity.startsWith('#')) { const n = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10); if (Number.isFinite(n) && n > 0 && n <= 0x10ffff) return String.fromCodePoint(n); }
    return match;
  }).replace(/\r\n?/g, '\n').replace(/<https?:\/\/[^>]+>|\[https?:\/\/[^\]]+\]/gi, '').replace(/https?:\/\/\S+/gi, '').replace(/[ \t]+/g, ' ').split('\n').map(line => line.trim()).filter(Boolean).join('\n');
}
export function receivedDay(received: string) {
  const date = new Date(received);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid email received date.');
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-');
}
export function emailIdentity(message: EstimateMessage) {
  return createHash('sha256').update(opportunityMailbox + ':' + message.id).digest('hex');
}
export function parseEstimateEmail(message: EstimateMessage): { fields: EmailOpportunityFields; text: string; reason: string | null } | null {
  // Replies, approvals, invoices and forwarded conversations are not new estimates.
  const subjectNumber = estimateNumberFromMessage(message);
  if (!subjectNumber) return null;
  const text = emailText(message.body), lines = text.split('\n');
  const fields: EmailOpportunityFields = { estimateNumber: subjectNumber, creationDate: receivedDay(message.receivedDateTime), status: 'Pending' };
  const bodyNumber = text.match(/\bESTIMATE\s+#?\s*(\d+)\s+DETAILS\b/i)?.[1];
  if (bodyNumber && bodyNumber !== subjectNumber) return { fields, text, reason: 'The estimate numbers in the subject and body differ.' };
  const greeting = text.match(/(?:^|\n)([^\n]{1,500}),\s*\n(?:Please review|Thank you for|We (?:appreciate|look forward)|Here is)/i)?.[1]?.trim();
  const billTo = text.match(/(?:^|\n)(?:Bill to|Customer|Property)\s*:?\s*\n([^\n]{1,500})/i)?.[1]?.trim();
  const property = greeting || billTo;
  if (property && !/^(?:hello|hi|good morning|good afternoon|dear (?:customer|client)|customer)\b/i.test(property)) fields.propertyName = property;
  // Use the total, never the first individual line-item price or subtotal.
  const totals = [...text.matchAll(/(?:^|\n)Total\s*:?[ \t]*(?:\n\s*)?\$\s*([\d,]+(?:\.\d{2})?)\b/gi)];
  const total = totals.at(-1)?.[1];
  // Some QuickBooks templates put only the grand total above "Review and approve".
  const headingTotal = text.match(/(?:^|\n)\$\s*([\d,]+(?:\.\d{2})?)\s*\nReview and approve\b/i)?.[1];
  if (total || headingTotal) fields.estimateAmount = moneyValue(total || headingTotal)!;
  const subtotal = lines.findIndex(line => /^Subtotal\b/i.test(line));
  const details = subtotal > -1 ? lines.slice(0, subtotal).flatMap((line, index) => {
    if (!/^\$[\d,.]+$/.test(line)) return [];
    const description = lines[index + 1], quantity = lines[index + 2];
    return description && quantity && /^\d+(?:\.\d+)?\s*[x×]\s*\$/i.test(quantity) && !/^\$/.test(description) ? [description] : [];
  }) : [];
  if (details.length) fields.name = [...new Set(details)].join(' · ').slice(0, 30000);
  const reason = !fields.propertyName ? 'The property could not be identified in this email.' : fields.estimateAmount === undefined ? 'The estimate total could not be identified in this email.' : null;
  return { fields, text, reason };
}
