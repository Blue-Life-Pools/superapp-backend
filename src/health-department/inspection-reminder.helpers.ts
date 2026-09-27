import type { HealthTicket, HealthTicketComment } from '@prisma/client';

export function calendarDate(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find((value) => value.type === type)!.value;
  return [part('year'), part('month'), part('day')].join('-');
}

export function inspectionDate(ticket: Pick<HealthTicket, 'healthData' | 'visitDate'>): string | null {
  const data = ticket.healthData as Record<string, unknown> | null;
  const source = data && Object.prototype.hasOwnProperty.call(data, 'Fecha de Inicio')
    ? data['Fecha de Inicio'] : ticket.visitDate?.toISOString().slice(0, 10);
  if (typeof source !== 'string' || !source.trim()) return null;
  const value = source.trim();
  let date = value.slice(0, 10);
  const legacy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (legacy) date = [legacy[3], legacy[1].padStart(2, '0'), legacy[2].padStart(2, '0')].join('-');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(date + 'T00:00:00Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
}

export function reminderWindow(date: string, today: string) {
  const remaining = Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
  // Catch up only the current window if the daily task was delayed; never send three at once.
  const daysBefore = remaining === 1 ? 1 : remaining > 1 && remaining <= 5 ? 5 : remaining > 5 && remaining <= 10 ? 10 : null;
  return daysBefore ? { remaining, daysBefore } : null;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}
const translations: Record<string, string> = {
  enviado: 'Sent', aprobado: 'Approved', rechazado: 'Rejected', convertido: 'Converted', realizado: 'Completed',
  requerido: 'Required', pendiente: 'Pending', cerrado: 'Closed', satisfactorio: 'Satisfactory', insatisfactorio: 'Unsatisfactory',
  cloro: 'Chlorine', estabilizador: 'Stabilizer',
};
function display(value: unknown): string {
  if (typeof value !== 'string') return '';
  try { const list: unknown = JSON.parse(value); if (Array.isArray(list)) return list.map(display).join(', '); } catch {}
  return translations[value.trim().toLowerCase()] || value;
}
export function reminderEmail(ticket: HealthTicket & { comments: HealthTicketComment[] }, date: string, remaining: number, appUrl: string) {
  const data = (ticket.healthData || {}) as Record<string, unknown>;
  const property = ticket.propertyName || display(data.Propiedad) || 'Property not assigned';
  const status = ticket.status === 'NEW' ? 'New' : ticket.status === 'CLOSED' ? 'Closed' : 'In progress';
  const fields: Array<[string, string]> = [
    ['Ticket', ticket.ticketNumber], ['Property', property], ['Inspection date', date], ['Days remaining', String(remaining)],
    ['Ticket status', status], ['Subject', ticket.subject], ['Initial report status', display(data.Estado)],
    ['Reinspection deadline', display(data['Fecha Límite'])], ['Violations', display(data.Violaciones)],
    ['Requires estimate', ticket.estimateStatus === 'REQUIRED' ? 'Yes' : 'No'],
    ['Estimate number', ticket.estimateNumber || display(data.Estimado)], ['Estimate status', display(data['Estado Estimado'])],
    ['Chemical', display(data.Quimico)], ['Feeders', display(data.Feeders)], ['Main drain', display(data['Main drain'])],
    ['Flow meter / Flow rate', display(data['Flow meter /  Flow rate'])], ['Safety line', display(data['Life Hook, safety line'])],
    ['Gauges / Gutters / Plugs', display(data['Gauges, gutters, Plugs'])], ['Rules / Water level', display(data['Rules / Water level'])],
    ['Step / Handrail', display(data['Step / Handrail'])], ['Final report status', display(data['Estado Final'])],
  ];
  const rows = fields.filter(([, value]) => value).map(([label, value]) => '<tr><th style="text-align:left;padding:8px;background:#f4f7fa">' + escapeHtml(label) + '</th><td style="padding:8px;white-space:pre-wrap">' + escapeHtml(value) + '</td></tr>').join('');
  const comments = ticket.comments.slice(-5).map((comment) => '<p><strong>' + escapeHtml(comment.author) + '</strong> · ' + escapeHtml(comment.createdAt.toISOString()) + '<br>' + escapeHtml(comment.body) + '</p>').join('');
  const url = /^https:\/\//.test(appUrl) ? appUrl : 'https://calculator-bluelife-frontend.vercel.app';
  return {
    subject: '[Health Department] Inspection in ' + remaining + (remaining === 1 ? ' day' : ' days') + ' — ' + property + ' — ' + ticket.ticketNumber,
    body: '<h2 style="color:#075477">Upcoming inspection</h2><p>Please prepare this property before its assigned inspection date.</p><table style="border-collapse:collapse;width:100%">' + rows + '</table>' + (comments ? '<h3>Recent comments</h3>' + comments : '') + '<p><a href="' + escapeHtml(url) + '">Open BlueLife · Health Department</a></p>',
  };
}
