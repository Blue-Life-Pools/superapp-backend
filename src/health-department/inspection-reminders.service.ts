import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MicrosoftGraphService } from '../microsoft-graph/microsoft-graph.service';
import { calendarDate, inspectionDate, reminderEmail, reminderWindow } from './inspection-reminder.helpers';

@Injectable()
export class InspectionRemindersService {
  constructor(private readonly prisma: PrismaService, private readonly graph: MicrosoftGraphService, private readonly config: ConfigService) {}

  async cron(authorization?: string) {
    const secret = this.config.get<string>('CRON_SECRET')?.trim();
    const expected = secret ? 'Bearer ' + secret : '';
    if (!expected || !authorization || expected.length !== authorization.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(authorization))) {
      throw new UnauthorizedException('Scheduled task authentication required.');
    }
    return this.run();
  }

  async configuration() {
    const token = await this.graph.getAccessToken();
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as { roles?: string[] };
    return {
      mailSendPermission: !!claims.roles?.includes('Mail.Send'),
      schedulerConfigured: !!this.config.get<string>('CRON_SECRET')?.trim(),
      recipient: 'service@bluelifepools.com',
      daysBefore: [10, 5, 1],
      timezone: this.config.get<string>('HEALTH_REMINDER_TIMEZONE') || 'America/Bogota',
      scheduleUtc: '0 13 * * *',
    };
  }

  async run(now = new Date()) {
    const config = await this.configuration();
    if (!config.mailSendPermission) return { accepted: 0, skipped: 0, failed: 0, blocked: 'Microsoft Graph application Mail.Send permission and admin consent required.' };
    const today = calendarDate(now, config.timezone);
    const tickets = await this.prisma.healthTicket.findMany({ where: { deletedAt: null, status: { not: 'CLOSED' } }, include: { comments: { orderBy: { createdAt: 'asc' } } } });
    let accepted = 0, skipped = 0, failed = 0;
    for (const ticket of tickets) {
      const date = inspectionDate(ticket);
      const window = date ? reminderWindow(date, today) : null;
      if (!date || !window) continue;
      const key = { ticketId: ticket.id, inspectionDate: date, daysBefore: window.daysBefore };
      let claimId: string;
      try {
        const claim = await this.prisma.healthInspectionReminder.create({ data: { ...key, recipient: config.recipient } });
        claimId = claim.id;
      } catch (error) {
        if ((error as { code?: string }).code !== 'P2002') throw error;
        const previous = await this.prisma.healthInspectionReminder.findUnique({ where: { ticketId_inspectionDate_daysBefore: key } });
        if (!previous || !['FAILED', 'CANCELLED'].includes(previous.status)) { skipped++; continue; }
        const retry = await this.prisma.healthInspectionReminder.updateMany({ where: { id: previous.id, status: previous.status }, data: { status: 'SUBMITTING', attemptedAt: now, error: null } });
        if (!retry.count) { skipped++; continue; }
        claimId = previous.id;
      }
      // Re-read after claiming: tickets can be edited, closed or deleted while the task runs.
      const current = await this.prisma.healthTicket.findUnique({ where: { id: ticket.id }, include: { comments: { orderBy: { createdAt: 'asc' } } } });
      if (!current || current.deletedAt || current.status === 'CLOSED' || inspectionDate(current) !== date) {
        await this.prisma.healthInspectionReminder.update({ where: { id: claimId }, data: { status: 'CANCELLED' } });
        skipped++; continue;
      }
      const email = reminderEmail(current, date, window.remaining, this.config.get<string>('HEALTH_APP_URL') || 'https://calculator-bluelife-frontend.vercel.app');
      try {
        await this.graph.request<void>('/users/service%40bluelifepools.com/sendMail', {
          method: 'POST', signal: AbortSignal.timeout(15000),
          body: JSON.stringify({ message: { subject: email.subject, body: { contentType: 'HTML', content: email.body }, toRecipients: [{ emailAddress: { address: config.recipient } }] }, saveToSentItems: true }),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Email submission failed';
        // A network timeout may happen AFTER acceptance. Do not resend an ambiguous submission.
        const status = /Microsoft Graph request failed \((400|401|403|404|429)\)/.test(message) ? 'FAILED' : 'UNKNOWN';
        await this.prisma.healthInspectionReminder.update({ where: { id: claimId }, data: { status, error: message.slice(0, 600) } });
        failed++; continue;
      }
      // Persist separately from the send catch: a DB failure must never mark an accepted email retryable.
      await this.prisma.healthInspectionReminder.update({ where: { id: claimId }, data: { status: 'ACCEPTED', acceptedAt: new Date() } });
      accepted++;
    }
    return { accepted, skipped, failed, recipient: config.recipient, today };
  }
}
